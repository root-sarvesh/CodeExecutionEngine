<<<<<<< HEAD
import os from "os";
import fs from "fs/promises";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import cors from "cors"; // Add this import

// ... other imports

const app = express();
app.use(cors()); // Add this line before your routes
app.use(express.json());
// ... rest of your code
const port = 8000;
=======
import "dotenv/config"
import os from "os"
import fs from "fs/promises"
import express from "express"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import { spawn } from "child_process"
import rateLimit from "express-rate-limit"

const app = express()
app.set('trust proxy', 1)
const port = process.env.PORT || 8000
>>>>>>> f906cce5e402995515f915fe7414bea0eb4f3af2

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

<<<<<<< HEAD
app.post('/exec', async (req, res) => {
    const { code, language } = req.body;
    
    // Create unique file names
    const fileId = Date.now();
    const extension = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'cpp';
    const filename = `code_${fileId}.${extension}`;
    const filepath = path.join(os.tmpdir(), filename);

    try {
        await fs.writeFile(filepath, code, "utf-8");

        let command = "";
        let args = [];

        if (language === "python") {
            command = process.platform === "win32" ? "python" : "python3";
            args = [filepath];
        } else if (language === "javascript") {
            command = "node";
            args = [filepath];
        } else if (language === "cpp") {
            // Simplified C++ execution (requires g++ installed)
            res.status(400).json({ error: "C++ requires a compilation step not yet configured." });
            return;
        }

        const child = spawn(command, args);

        let output = "";
        let errorOutput = "";
        let sent = false; // Flag to prevent multiple responses

        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { errorOutput += data.toString(); });

        child.on('error', async (err) => {
            if (sent) return;
            sent = true;
            try { await fs.unlink(filepath); } catch(e) {}
            res.status(500).json({ error: `Execution Error: Could not find '${command}'. Make sure it is installed.` });
        });

        child.on('close', async (exitCode) => {
            if (sent) return;
            sent = true;
            try { await fs.unlink(filepath); } catch(e) {}

            if (errorOutput) {
                res.json({ error: errorOutput });
            } else {
                res.json({ output: output || "Program finished with no output." });
            }
        });

        // Safety timeout: kill process after 10 seconds
        setTimeout(() => {
            if (!sent) {
                child.kill();
                sent = true;
                res.status(408).json({ error: "Execution Timed Out (Max 10s)" });
            }
        }, 10000);

    } catch (err) {
        console.error("Server Crash:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Server failed to process the request." });
        }
=======
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
    }
}


const codeExecutionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 10,
    message: {
        status: "TOO_MANY_REQUESTS",
        stderr: "You are running code too fast. Please wait a minute."
    }
})

app.use(express.json())
app.use(express.urlencoded({extended: true}))


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, '../public')))


app.post('/exec', codeExecutionLimiter, async (req, res) => {
    
    const { code, language, input } = req.body;

    if (!language || !LANGUAGE_CONFIG[language.toLowerCase()]) {
        return res.status(400).json({ 
            status: "ERROR", 
            stderr: "Please select a valid language." 
        });
>>>>>>> f906cce5e402995515f915fe7414bea0eb4f3af2
    }
});

<<<<<<< HEAD
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
=======
    const config = LANGUAGE_CONFIG[language.toLowerCase()];
    const uniqueId = crypto.randomUUID()
    const tempDir = path.join(os.tmpdir(), `exec-${uniqueId}`)
    const filepath = path.join(tempDir, config.fileName)

    async function cleanUp() {
        try { await fs.rm(tempDir, { recursive: true, force: true }) } 
        catch (e) { console.error("Cleanup failed:", e) }
    }

    try {
        await fs.mkdir(tempDir, { recursive: true })
        await fs.chmod(tempDir, 0o777) 
        await fs.writeFile(filepath, code || "", "utf-8")
        await fs.chmod(filepath, 0o777)
    } catch(e) {
        await cleanUp()
        return res.status(500).json({status: "ERROR", stderr: "Server file error"})
    }
    
   
    const dockerArgs = [
        "run",
        "-i",                          
        "--rm",                        
        "--network", "none",          
        "--memory", process.env.MEMORY_LIMIT,            
        "--cpus", process.env.CPU_LIMIT,               
        "--pids-limit", "20",          
        "-v", `${tempDir}:/code:rw`,   
        "-w", "/code",                 
        process.env.DOCKER_IMAGE,                
        "/bin/sh", "-c", config.command 
    ]

    let finished = false
    let stdout = ''
    let stderr = ''    

    const child = spawn("docker", dockerArgs)

    if (input) {
        child.stdin.write(input); 
    }
    child.stdin.end();


    const timer = setTimeout(async () => {
        if (finished) return 
        finished = true
        child.kill("SIGKILL");
        await cleanUp()
        if(!res.headersSent){
            res.json({ status: "TIME_LIMIT_EXCEEDED", stdout, stderr })
        }
    }, 10000)

    child.stdout.on('data', (data) => stdout += data.toString())
    child.stderr.on('data', (data) => stderr += data.toString())

    child.on('close', async (code) => {
        if (finished) return
        finished = true 
        clearTimeout(timer)
        await cleanUp()
        
        res.json({
            status: code === 0 ? "SUCCESS" : "ERROR",
            stdout,
            stderr
        })
    })

    child.on('error', async (err) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        await cleanUp()
        if(!res.headersSent) res.status(500).json({ status: "INTERNAL_ERROR", stderr: err.message })
    })
})

app.listen(port, () => {
    console.log(`Code engine listenign on port${port}`)
})
>>>>>>> f906cce5e402995515f915fe7414bea0eb4f3af2
