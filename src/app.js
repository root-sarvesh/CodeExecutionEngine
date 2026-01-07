import os from "os"
import fs from "fs/promises"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import { spawn } from "child_process"


const app=express()
const port=8000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const filepath=path.join(os.tmpdir(),'file.py')
const directoryPath=os.tmpdir()



app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname,'../public')))

app.get('/exec',(req,res)=>{
    res.send(req.query)
})


app.post('/exec',async (req,res)=>{
    
    try{
        await fs.writeFile(filepath,req.body.code,"utf-8")
        console.log("file written")
    }catch(e){
        console.log("error while writing the file " + e)
    }
    
    let finished=false
    let timeout=false
    let stdout=''
    let stderr=''    


    const child = spawn("docker",[
        "run",
        "--rm",
        `-v ${directoryPath}:/code`,
        "python-runner",
        "file.py"

    ] )

    const timer= setTimeout(()=>{
        if(finished) return 
        child.kill();
        console.log("child killed")
        finished=true
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

    child.on('close',(code)=>{
        if(finished) return
        console.log("process exited with code : "+code)
        finished=true 
        clearTimeout(timer)
        if(code===0){
            console.log("running before success")
            if(!res.headersSent){
            res.json({
            status: "SUCCESS",
            stdout,
            stderr
        })}
        console.log("resposnse sent")
        }else{
            if(!res.headersSent){
            res.json({
            status: "TERMINATED",
            stdout,
            stderr
        })}
        }
        
    })

    child.on('error',(err)=>{
        console.log("error occured: "+err.message)
        if(!res.headersSent){
        res.json({
            status: "TERMINATED",
            stdout,
            stderr
        })}
    })
    
    
})

app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`)
})


