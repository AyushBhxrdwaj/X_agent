import express, { text } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {createPost} from "./mcp.tool.js"



const server = new McpServer({
  name: "backwards-compatible-server",
  version: "1.0.0"
});

server.tool("addTwoNumbers", "add two numbers",
  {
    a: z.number(),
    b: z.number()
  },
  async (arg) => {
    const { a, b } = arg
    return {
      content:
        [
          {
            type: 'text',
            text: `The sum of ${a} and ${b} is ${a + b}`
          }
        ]
    }
  }
)

server.tool("createPost", "create a post on X",{
  status:z.string()
},async(arg)=>{
  const {status}=arg;
  return createPost(status)
})

const app = express();
app.use(express.json());

const transports = {};
transports.sse = {}

// Modern Streamable HTTP endpoint
app.all('/mcp', async (req, res) => {
});


app.get('/sse', async (req, res) => {

  const transport = new SSEServerTransport('/messages', res);
  transports.sse[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports.sse[transport.sessionId];
  });

  await server.connect(transport);
});


app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

app.listen(3000);