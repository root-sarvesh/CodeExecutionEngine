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
const port = 8000



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
        "--memory", "128m",            
        "--cpus", "0.5",               
        "--pids-limit", "20",          
        "-v", `${tempDir}:/code:rw`,   
        "-w", "/code",                 
        "code-runner",                
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
    console.log(`Multi-Language Engine listening on port ${port}`)
})