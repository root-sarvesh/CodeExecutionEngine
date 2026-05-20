import os from "os";
import fs from "fs/promises";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import cors from "cors";
import crypto from "crypto"; 
import rateLimit from "express-rate-limit"; 

const app = express();
const port = process.env.PORT || 8000;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_OUTPUT_BUFFER = 1024 * 1024; 
const TIMEOUT_MS = 6000;               

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
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
    windowMs: 1 * 60 * 1000, 
    max: 10,                 
    message: {
        status: "TOO_MANY_REQUESTS",
        stderr: "You are running code too fast. Please wait a minute."
    }
});

class ExecutionQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    enqueue(task) {
        this.queue.push(task);
        this.process();
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;
        
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            try {
                await task(); // Wait for the current code execution to completely finish
            } catch (err) {
                console.error("Queue task error:", err);
            }
        }
        
        this.isProcessing = false;
    }
}
const jobQueue = new ExecutionQueue();
// ------------------------------------------

// Code execution endpoint
app.post('/exec', codeExecutionLimiter, (req, res) => {
    
    // Add the execution request to the queue
    jobQueue.enqueue(() => {
        return new Promise(async (resolve) => {
            
            // Check if user disconnected while waiting in queue
            if (req.socket.destroyed) {
                return resolve(); 
            }

            const { code, language, input } = req.body;

            // Validate Language
            if (!language || !LANGUAGE_CONFIG[language.toLowerCase()]) {
                res.status(400).json({ status: "ERROR", stderr: "Please select a valid language." });
                return resolve();
            }

            const config = LANGUAGE_CONFIG[language.toLowerCase()];
            const uniqueId = crypto.randomUUID();
            const tempDir = path.join(os.tmpdir(), `exec-${uniqueId}`);
            const containerName = `box_${uniqueId}`;
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
                res.status(500).json({ status: "ERROR", stderr: "Server file error" });
                return resolve();
            }
            
            const memLimit = process.env.MEMORY_LIMIT || "256m";
            const cpuLimit = process.env.CPU_LIMIT || "0.5";
            const dockerImage = process.env.DOCKER_IMAGE || "code-runner"; 

            const dockerArgs = [
                "run",
                "--name", containerName,
                "-i",                          
                "--rm",                        
                "--network", "none",           
                "--memory", memLimit,          
                "--cpus", cpuLimit,            
                "--pids-limit", "20",          
                "-v", `${tempDir}:/code:rw`,   
                "-w", "/code",                 
                dockerImage,                   
                "/bin/sh", "-c", config.command 
            ];

            let finished = false;
            let stdout = '';
            let stderr = '';    
            let timer = null;

            const cleanAndKill = () => {
                if (finished) return;
                finished = true;
                
                if (timer) clearTimeout(timer);
                
                // Spawn a detached process to ensure the container is wiped out
                const killer = spawn("docker", ["rm", "-f", containerName]);
                killer.on('error', () => {}); // Ignore killer errors
                
                child.kill("SIGKILL");
                cleanUp(); 
            };

            const handleOutput = (data, streamType) => {
                if (finished) return;
                
                const text = data.toString();
                if (streamType === 'stdout') stdout += text;
                if (streamType === 'stderr') stderr += text;

                // OOM Crash Prevention
                if (stdout.length + stderr.length > MAX_OUTPUT_BUFFER) {
                    stderr += "\n[Error: Output exceeded maximum limit of 1MB]";
                    cleanAndKill();
                    if (!res.headersSent) {
                        res.json({ status: "OUTPUT_LIMIT_EXCEEDED", stdout, stderr });
                    }
                    resolve(); // Move to next job in queue
                }
            };

            const child = spawn("docker", dockerArgs);

            // Feed standard input if provided
            if (input) {
                child.stdin.write(input); 
            }
            child.stdin.end();

            // Timeout Handler
            timer = setTimeout(() => {
                if (finished) return; 
                cleanAndKill();
                if (!res.headersSent) {
                    res.json({ status: "TIME_LIMIT_EXCEEDED", stdout, stderr });
                }
                resolve(); // Move to next job in queue
            }, TIMEOUT_MS);

            // Collect Output using the safe handler
            child.stdout.on('data', (data) => handleOutput(data, 'stdout'));
            child.stderr.on('data', (data) => handleOutput(data, 'stderr'));

            // Handle process completion
            child.on('close', (exitCode) => {
                if (finished) return;
                cleanAndKill();
                
                if (!res.headersSent) {
                    res.json({
                        status: exitCode === 0 ? "SUCCESS" : "ERROR",
                        stdout,
                        stderr
                    });
                }
                resolve(); // Move to next job in queue
            });

            // Handle spawn errors
            child.on('error', (err) => {
                if (finished) return;
                cleanAndKill();
                
                if (!res.headersSent) {
                    res.status(500).json({ status: "INTERNAL_ERROR", stderr: err.message });
                }
                resolve(); // Move to next job in queue
            });
        });
    });
});

app.listen(port, () => {
    console.log(`Code engine listening on port ${port}`);
});