import os from "os"
import fs from "fs/promises"
import express from "express"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import { spawn } from "child_process"


const app=express()
const port=8000

//paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const directoryPath=os.tmpdir()


//middlewares
app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname,'../public')))

app.get('/exec',(req,res)=>{
    res.send(req.query)
})


app.post('/exec',async (req,res)=>{
    
    const uniqueId = crypto.randomUUID()
    const tempDir = path.join(os.tmpdir(),`exec-${uniqueId}`)

    try{
        await fs.mkdir(tempDir)
    }catch(e){
        return res.status(500).json({status: "Directory creation failed"})
    }

    const filepath = path.join(tempDir,'file.py')

    try{
        await fs.writeFile(filepath,req.body.code,"utf-8")
        console.log("file written")
    }catch(e){
        await cleanUp()
        console.log("error while writing the file " + e)
        return res.status(500).json({status: "File creation failed"})
    }
    
    let finished=false
    let timeout=false
    let stdout=''
    let stderr=''    


    const child = spawn("docker",[
        "run",
        "--rm",
        `-v`,
        `${tempDir}:/code`,
        "python-runner",
        "python",
        "/code/file.py"

    ] )

    const timer= setTimeout(async ()=>{
        if(finished) return 
        finished=true
        child.kill("SIGKILL");
        await cleanUp()
        clearTimeout(timer)
        console.log("child killed")
        timeout=true
        console.log("time limit exceeded")
        console.log(stdout)
        if(!res.headersSent){
        res.json({
        status: "TIME_LIMIT_EXCEEDED",
        stdout,
         stderr
    })
}

    },10000)

    
    child.stdout.on('data',(data)=>{
        stdout+=data.toString()
    })

    child.stderr.on('data',(error)=>{
        stderr+=error.toString()
    })

    child.on('close',async (code)=>{
        if(finished) return
        console.log("process exited with code : "+code)
        finished=true 
        clearTimeout(timer)
        await cleanUp()
        if(code===0){
            console.log("running before success")
            if(!res.headersSent){
            res.json({
            status: "SUCCESS",
            stdout,
            stderr
        })}
        console.log("response sent")
        }else{
            if(!res.headersSent){
            res.json({
            status: "TERMINATED",
            stdout,
            stderr
        })}
        }
        
    })

    child.on('error',async (err)=>{
        if (finished) return
        finished=true
        clearTimeout(timer)
        console.log("error occured: "+err.message)
        await cleanUp()
        if(!res.headersSent){
        res.json({
            status: "TERMINATED",
            stdout,
            stderr
        })}
    })

    async function cleanUp() {
        try {
            await fs.rm(tempDir, { recursive: true, force: true })
        } catch (err) {
            console.error("Cleanup failed:", err)
        }
    }
    
    
})

app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`)
})


