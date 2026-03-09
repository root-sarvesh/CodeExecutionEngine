import os from "os";
import fs from "fs/promises";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import cors from "cors";
import crypto from "crypto"; // Required for crypto.randomUUID()
import rateLimit from "express-rate-limit"; // Ensure you run: npm install express-rate-limit

const app = express();
const port = process.env.PORT || 8000;

// Setup path variables for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Language configurations
const LANGUAGE_CONFIG = {
    "python": {
        fileName: "solution.py",
        command: "python3 solution.py"
    },
    "cpp": {
        fileName: "solution.cpp",
        command: "g++ solution.cpp -o solution && ./solution"
    },
    "java": {
        fileName: "Main.java", 
        command: "javac Main.java && java Main"
    },
    "javascript": {
        fileName: "solution.js",
        command: "node solution.js"
    }
};

// Rate limiting to prevent abuse
const codeExecutionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,                 // 10 requests per minute
    message: {
        status: "TOO_MANY_REQUESTS",
        stderr: "You are running code too fast. Please wait a minute."
    }
});

// Code execution endpoint
app.post('/exec', codeExecutionLimiter, async (req, res) => {
    const { code, language, input } = req.body;

    // Validate Language
    if (!language || !LANGUAGE_CONFIG[language.toLowerCase()]) {
        return res.status(400).json({ 
            status: "ERROR", 
            stderr: "Please select a valid language." 
        });
    }

    const config = LANGUAGE_CONFIG[language.toLowerCase()];
    const uniqueId = crypto.randomUUID();
    const tempDir = path.join(os.tmpdir(), `exec-${uniqueId}`);
    const filepath = path.join(tempDir, config.fileName);

    // Helper to clean up temporary files
    async function cleanUp() {
        try { 
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (e) { 
            console.error("Cleanup failed:", e);
        }
    }

    // Write code to a temporary directory
    try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.chmod(tempDir, 0o777); 
        await fs.writeFile(filepath, code || "", "utf-8");
        await fs.chmod(filepath, 0o777);
    } catch(e) {
        await cleanUp();
        return res.status(500).json({ status: "ERROR", stderr: "Server file error" });
    }
    
    // Set up Docker arguments with fallbacks for env variables
    const memLimit = process.env.MEMORY_LIMIT || "256m";
    const cpuLimit = process.env.CPU_LIMIT || "0.5";
    const dockerImage = process.env.DOCKER_IMAGE || "code-runner"; 

    const dockerArgs = [
        "run",
        "-i",                          // Interactive (keep STDIN open even if not attached)
        "--rm",                        // Remove container when it exits
        "--network", "none",           // Disable networking for security
        "--memory", memLimit,          // Limit memory
        "--cpus", cpuLimit,            // Limit CPU
        "--pids-limit", "20",          // Prevent fork bombs
        "-v", `${tempDir}:/code:rw`,   // Mount the temp directory
        "-w", "/code",                 // Set working directory
        dockerImage,                   // The Docker image to use
        "/bin/sh", "-c", config.command 
    ];

    let finished = false;
    let stdout = '';
    let stderr = '';    

    const child = spawn("docker", dockerArgs);

    // Feed standard input if provided
    if (input) {
        child.stdin.write(input); 
    }
    child.stdin.end();

    // 10-Second Timeout
    const timer = setTimeout(async () => {
        if (finished) return; 
        finished = true;
        child.kill("SIGKILL");
        await cleanUp();
        if (!res.headersSent) {
            res.json({ status: "TIME_LIMIT_EXCEEDED", stdout, stderr });
        }
    }, 6000);

    // Collect Output
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    console.log(stdout)
    console.log(stderr)
    // Handle process completion
    child.on('close', async (exitCode) => {
        if (finished) return;
        finished = true; 
        clearTimeout(timer);
        await cleanUp();
        
        res.json({
            status: exitCode === 0 ? "SUCCESS" : "ERROR",
            stdout,
            stderr
        });
    });

    // Handle spawn errors
    child.on('error', async (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        await cleanUp();
        if (!res.headersSent) {
            res.status(500).json({ status: "INTERNAL_ERROR", stderr: err.message });
        }
    });
});

app.listen(port, () => {
    console.log(`Code engine listening on port ${port}`);
});