# 🐦 Twitter Agent using Gemini + MCP

A smart Twitter agent that **generates and posts tweets using a single prompt**.  
Built with a mix of **Gemini (Google AI)** for content generation and **MCP (Model Context Protocol)** for tool execution.

---

## ✨ Features

- 🔁 Single-prompt tweet generation and posting
- 🤖 AI-powered tweet creation using Gemini (Pro or Flash)
- 🛠️ Tool execution via MCP to automate Twitter posting
- 💬 Interactive CLI-based chatbot experience
- 📜 Maintains chat history for contextual generation

---

## 🧠 How It Works

1. You start a conversation via CLI.
2. If your input contains keywords like `tweet`, `post`, or `twitter`, the agent:
   - Automatically generates a tweet using Gemini
   - Calls the `createPost` tool via MCP to post it
3. For non-tweet prompts, it responds like a regular chatbot.

---

## 🚀 Tech Stack

- **Node.js**
- **Google GenAI SDK** (`@google/genai`)
- **Model Context Protocol (MCP)** SDK
- **dotenv** for managing secrets
- **readline/promises** for interactive input

---

## 📦 Installation

```bash
git clone https://github.com/your-username/twitter-agent.git
cd twitter-agent
npm install
