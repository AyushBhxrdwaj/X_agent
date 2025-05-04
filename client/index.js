import { config } from 'dotenv';
import readline from 'readline/promises';
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

config();

let tools = [];
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const mcpClient = new Client({
    name: "interactive-twitter-agent",
    version: "1.0.0",
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});


const chatHistory = [];

// System prompt that instructs the AI to generate tweets without asking for input
const systemPrompt = {
    role: "user",
    parts: [
        {
            text: `You are a Twitter post generation assistant. When the user provides a topic or asks you to create a tweet, 
                  generate a tweet without asking any further questions. The tweet should be:
                  - Concise (under 280 characters)
                  - Engaging and informative
                  - Include 1-3 relevant hashtags
                  
                  IMPORTANT: When asked to create a tweet, generate the text directly and post it.
                  Do NOT ask "How's this?" or "Would you like me to post this?"
                  If the user's input is about creating a tweet or posting content, assume they want you to generate and post a tweet.
                  
                  For other types of questions or conversations, respond normally.`,
            type: "text"
        }
    ]
};


chatHistory.push(systemPrompt);

async function handleToolCall(toolCall) {
    console.log("Calling tool:", toolCall.name);
    const toolResult = await mcpClient.callTool({
        name: toolCall.name,
        arguments: toolCall.args
    });
    

    
    
    chatHistory.push({
        role: "user",
        parts: [
            {
                text: "Tool result: " + toolResult.content[0].text,
                type: "text"
            }
        ]
    });
}


async function chatLoop() {
    try {
        await mcpClient.connect(new SSEClientTransport(new URL("http://localhost:3001/sse")));
        console.log("Connected to MCP server");
        
        tools = (await mcpClient.listTools()).tools.map(tool => {
            return {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: tool.inputSchema.type,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required
                }
            }
        });
        
        console.log("Available tools:", tools.map(t => t.name).join(", "));
        console.log("\nWelcome! Ask me to create a tweet about any topic, or chat with me about anything else.");
        console.log("Example: 'Create a tweet about AI advancements' or 'Tweet about the latest tech trends'\n");
       
        while (true) {
            const userInput = await rl.question('You: ');
            
         
            if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
                console.log("Goodbye!");
                rl.close();
                process.exit(0);
            }
            
            // Add user input to chat history
            chatHistory.push({
                role: "user",
                parts: [
                    {
                        text: userInput,
                        type: "text"
                    }
                ]
            });
            
            // Check if this is a tweet request
            const isTweetRequest = userInput.toLowerCase().includes('tweet') || 
                                  userInput.toLowerCase().includes('post') ||
                                  userInput.toLowerCase().includes('twitter');
            
            let contents = chatHistory;
            
            // If this is a tweet request, add an explicit instruction
            if (isTweetRequest) {
                // Clone chat history to avoid modifying the original
                contents = [...chatHistory];
                // Add an explicit instruction for tweet generation as the last message
                contents.push({
                    role: "user",
                    parts: [
                        {
                            text: `Generate a tweet about "${userInput}" without asking any questions. The tweet should be ready to post immediately. Don't ask if I want to post it, just generate the tweet text.`,
                            type: "text"
                        }
                    ]
                });
            }
            
          
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: contents,
                config: {
                    tools: [
                        {
                            functionDeclarations: tools,
                        }
                    ]
                }
            });
            
            const functionCall = response.candidates[0].content.parts[0].functionCall;
            const responseText = response.candidates[0].content.parts[0].text;
            
      
            chatHistory.push({
                role: "model",
                parts: [
                    {
                        text: responseText || "Processing tool call...",
                        type: "text"
                    }
                ]
            });
            
            if (functionCall) {
                
                await handleToolCall(functionCall);
            } else if (responseText) {
              
                console.log(`AI: ${responseText}`);
                
                // If this was a tweet request and no tool was called, post the tweet automatically
                if (isTweetRequest) {
                    let tweetContent = '';
                    
                    // Try to extract content between quotes first
                    const quoteMatch = responseText.match(/"([^"]+)"/);
                    if (quoteMatch) {
                        tweetContent = quoteMatch[1];
                    } else {
                        // Otherwise take the first non-empty line
                        const lines = responseText.split('\n').filter(line => line.trim().length > 0);
                        if (lines.length > 0) {
                            tweetContent = lines[0].trim();
                        }
                    }
                    
                 
                    if (tweetContent && tweetContent.length > 0) {
                        console.log("Posting tweet:", tweetContent);
                        
                        try {
                            const toolResult = await mcpClient.callTool({
                                name: "createPost",
                                arguments: {
                                    status: tweetContent
                                }
                            });
                            
                            
                          
                            chatHistory.push({
                                role: "user",
                                parts: [
                                    {
                                        text: "Tool result: " + toolResult.content[0].text,
                                        type: "text"
                                    }
                                ]
                            });
                        } catch (error) {
                            console.error("Error posting tweet:", error);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error in chat loop:", error);
        rl.close();
    }
}


console.log("Starting Twitter agent...");
chatLoop();