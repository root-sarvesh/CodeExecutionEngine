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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));