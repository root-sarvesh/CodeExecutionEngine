import os from "os"
import fs from "fs/promises"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import { spawn } from "child_process"
import { error } from "console"

const app=express()
const port=8000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const filepath=path.join(os.tmpdir(),'file.py')




app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname,'../public')))

app.get('/exec',(req,res)=>{
    res.send(req.query)
})


app.post('/exec',(req,res)=>{
    
    try{
        fs.writeFile(filepath,req.body.code,"utf-8")
        fs.writeFile('example.py',req.body.code,"utf-8")
        console.log("file written")
    }catch(e){
        console.log("error while writing the file " + e)
    }

    const child = spawn("python", [filepath])

    child.stdout.on('data',(data)=>{
        console.log('stdout: '+data.toString())
    })

    child.stderr.on('data',(error)=>{
        console.log('error: '+error.toString())
    })

    child.on('close',(code)=>{
        console.log("process exited with code : "+code)
    })

    child.on('error',(err)=>{
        console.log("error occured: "+err.message)
    })



})

app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`)
})


