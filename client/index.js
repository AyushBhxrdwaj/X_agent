import readline from 'readline/promises';
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import env from 'dotenv';
import { GoogleGenAI } from "@google/genai";
import { text } from 'stream/consumers';
env.config()

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let tools = []
const mcpClient = new Client({
    name: "backwards-compatible-client",
    version: "1.0.0",
});

async function main() {
    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Explain how AI works in a few words",
    });
    console.log(response.text);
}

await main();

const chathistory = []

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
mcpClient.connect(new SSEClientTransport(new URL('http://localhost:3000/sse')))
    .then(async () => {
        console.log("Connected to MCP server")
        tools = (await mcpClient.listTools()).tools.map(tool=>{
            return {
                name: tool.name,
                description: tool.description,
                parameters:{
                    type:tool.inputSchema.type,
                    properties:tool.inputSchema.properties,
                    required:tool.inputSchema.required
                }
            }
        })
        chat()
    })
    .catch(err=>{
        console.log("Failed to connect to MCP server",err)
    })

async function chat(toolcall) {

    if(toolcall){
        console.log(`Calling tool ${toolcall.name}`)
        chathistory.push({
            role:"model",
            parts:[{
                text:`calling tool ${toolcall.name}`,
                type:"text"
            }]
        })
        const toolres= await mcpClient.callTool({
            name:toolcall.name,
            arguments:toolcall.args
        })
        chathistory.push({
            role:"user",
            parts:[{
                text:`Tool result is: ${toolres.content[0].text}`,
                type:"text"
            }]
        })
    }else{
        const ques = await rl.question('You: ');
        chathistory.push({
            role: 'user',
            parts: [{
                text: ques,
                type: 'text'
            }]
        })

    }
    

    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: chathistory,
        config:{
            tools:[
                {
                    functionDeclarations:tools
                }
            ]
        }
    })

    const funcCall=response.candidates[0].content.parts[0].functionCall
    const ans = response.candidates[0].content.parts[0].text

    if(funcCall){
        return chat(funcCall)
    }

    chathistory.push({
        role: 'model',
        parts: [{
            text: ans,
            type: 'text'
        }]
    })
    console.log(`Agent: ${ans}`)
    chat()
}
