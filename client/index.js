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

const systemPrompt = {
    role: "user",
    parts: [
        {
            text: `You are a Twitter post generation assistant. When the user provides a topic or asks you to create a tweet, 
                  generate a tweet without asking any further questions. The tweet should be:
                  - Concise (under 280 characters)
                  - Engaging and informative
                  - Include 1-3 relevant hashtags
                  When asked to create a tweet, generate and post it.
                  Do NOT ask for confirmation or input again.`,
            type: "text"
        }
    ]
};

chatHistory.push(systemPrompt);

async function handleToolCall(toolCall) {
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

        tools = (await mcpClient.listTools()).tools.map(tool => {
            return {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: tool.inputSchema.type,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required
                }
            };
        });

        while (true) {
            const userInput = await rl.question('You: ');

            if (["exit", "quit"].includes(userInput.toLowerCase())) {
                rl.close();
                process.exit(0);
            }

            chatHistory.push({
                role: "user",
                parts: [{ text: userInput, type: "text" }]
            });

            const isTweetRequest = ["tweet", "post", "twitter"].some(word =>
                userInput.toLowerCase().includes(word)
            );

            let contents = chatHistory;

            if (isTweetRequest) {
                contents = [...chatHistory];
                contents.push({
                    role: "user",
                    parts: [
                        {
                            text: `Generate a tweet about "${userInput}" without asking any questions. The tweet should be ready to post.`,
                            type: "text"
                        }
                    ]
                });
            }

            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents,
                config: {
                    tools: [{ functionDeclarations: tools }]
                }
            });

            const part = response.candidates[0].content.parts[0];
            const functionCall = part.functionCall;
            const responseText = part.text;

            chatHistory.push({
                role: "model",
                parts: [{ text: responseText || "Processing tool call...", type: "text" }]
            });

            if (functionCall) {
                await handleToolCall(functionCall);
            } else if (responseText && isTweetRequest) {
                let tweetContent = '';
                const quoteMatch = responseText.match(/"([^"]+)"/);

                if (quoteMatch) {
                    tweetContent = quoteMatch[1];
                } else {
                    const lines = responseText.split('\n').filter(line => line.trim().length > 0);
                    if (lines.length > 0) tweetContent = lines[0].trim();
                }

                if (tweetContent) {
                    try {
                        const toolResult = await mcpClient.callTool({
                            name: "createPost",
                            arguments: { status: tweetContent }
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
            } else if (responseText) {
                console.log(`AI: ${responseText}`);
            }
        }
    } catch (error) {
        console.error("Error in chat loop:", error);
        rl.close();
    }
}

chatLoop();
