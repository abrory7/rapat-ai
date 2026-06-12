# 🤖 Rapat AI

> **Supervised Autopilot Multi-Agent Discussion Workspace**
>
> Rapat AI is an advanced, self-hosted multi-agent discussion workspace operating directly on your local codebases. It orchestrates specialized AI agent roles (such as Product Manager, Architect, Engineer, QA, and Critic) to analyze your code using MCP (Model Context Protocol) tools and compile detailed technical planning documents under human supervision.
>
> ⚠️ **Note on Active Development:** Please note that several features, including the local workspace file-reading tools and Model Context Protocol (MCP) server integration, are currently under active development and may evolve or be subject to changes.
>
> 🔑 **BYOK (Bring Your Own Key) Only:** Rapat AI operates entirely on a Bring Your Own Key basis. No default, free, or pre-paid API keys are provided. You must supply your own API keys (e.g., Google Gemini, OpenAI, Anthropic) or connect local models (via Ollama) inside the settings dashboard to run the agents. All keys are encrypted using AES-256-GCM and stored locally in your database.

---

## 🛠️ Technology Stack

Rapat AI is built using modern, fast, and secure developer-focused technologies:

*   **Frontend & Backend:** [Next.js](https://nextjs.org/) (App Router, Server Actions, API Routes) with [TypeScript](https://www.typescriptlang.org/)
*   **Agent Engine:** [Mastra Agent Framework](https://mastra.ai/) (`@mastra/core`) for orchestrating agents, tools, and workflows
*   **Database & ORM:** SQLite database managed via [Prisma ORM](https://www.prisma.io/)
*   **Styling:** Vanilla CSS (CSS Modules) tailored for clean dark/light mode aesthetics
*   **Cryptography:** Node.js native `crypto` module implementing AES-256-GCM encryption for API keys

---

## 📂 Project Directory Map

Here is a guide to the key directories in this project:

*   [`prisma/`](file:///Users/abrory7/Kantor/Web/rapat-ai/prisma) - Database configuration, SQLite schema ([`schema.prisma`](file:///Users/abrory7/Kantor/Web/rapat-ai/prisma/schema.prisma)), and seeding data.
*   [`src/app/`](file:///Users/abrory7/Kantor/Web/rapat-ai/src/app) - Next.js page views, API endpoints, and styles.
*   [`src/mastra/`](file:///Users/abrory7/Kantor/Web/rapat-ai/src/mastra) - Mastra Agent Framework setup (defining agents, agent tools, and compilation workflows).
*   [`src/lib/orchestrator/`](file:///Users/abrory7/Kantor/Web/rapat-ai/src/lib/orchestrator) - Core engine coordinating agent turns, decision extraction, and parsing.
*   [`src/lib/crypto/`](file:///Users/abrory7/Kantor/Web/rapat-ai/src/lib/crypto) - AES-256-GCM encryption utilities for safeguarding API keys.

---

## 🚀 Key Features

*   **Autopilot Discussions:** Select pre-defined templates (e.g., Feature Planning, Architecture Design, Code Review) and watch AI agents debate and resolve engineering details.
*   **Local Codebase Tools:** Agents use secure workspace tools to read, list, and search files inside your project directory.
*   **Model Context Protocol (MCP):** Connect custom stdio or SSE MCP servers on demand to extend agent capabilities.
*   **Human-in-the-Loop Supervision:** Real-time chat dashboard displaying discussion steps, detected project badges (Flags, Decisions, Parking Lot), and instant Markdown previews.
*   **Multi-Provider Support (BYOK):** Plug in your own API keys for OpenAI, Anthropic, Google Gemini, or run local models via Ollama.

### 🤖 Agent Workspace Tools

When agents are running a discussion inside a registered project workspace, they have access to local-only tools to analyze and output files:

*   `list_files` - Lists workspace directory contents while automatically respecting `.gitignore` rules.
*   `read_file` - Reads file contents (up to 100KB) into context.
*   `search_code` - Performs fast text pattern searches across files.
*   `write_output` - Writes the resulting specifications and diagrams directly to the target project's `.rapat-ai/outputs/` directory.

---

## 💻 Installation & Setup

Follow these steps to set up Rapat AI on your local machine:

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18.x or higher) and `npm` installed.

### 2. Clone and Install Dependencies
Clone this repository to your local machine, navigate to the project directory, and install the package dependencies:
```bash
npm install
```

### 3. Configure Environment Variables
Copy the template environment file:
```bash
cp .env.example .env
```
*(No need to enter API keys here. Rapat AI is BYOK-only; your API keys will be registered securely via the web UI and encrypted at rest in the database).*

### 4. Initialize the Database & Seed Data
Initialize your local SQLite database using Prisma and seed it with pre-built discussion roles, workflow templates, and agent skills:
```bash
npx prisma db push
npx prisma db seed
```
This creates the local database file `prisma/dev.db` and populates the database with initial settings.

### 5. Run the Development Server
Start the Next.js local server:
```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your web browser to access the Rapat AI Workspace.

### 🧪 Running Tests
You can run the built-in test suites to verify functionality and security:
```bash
# Test the agent orchestrator state machine and parser
npm run test:orchestrator

# Test security rules, API key cryptography, and MCP safety checks
npm run test:security
```

---

## 📖 Quick Start / How to Use

Once the application is running, follow this simple workflow to start an agentic codebase discussion:

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│ 1. Setup Wizard │ ───► │ 2. Add Provider  │ ───► │  3. Add Project │ ───► │ 4. Start Session │
└─────────────────┘      └──────────────────┘      └─────────────────┘      └──────────────────┘
```

1.  **Complete the Setup Wizard:** On your first launch, the wizard will guide you through connecting an AI provider and adding your first project directory.
2.  **Add a Provider (API Key):**
    *   Navigate to **Settings > Providers**.
    *   Add your preferred provider (e.g., *Google Gemini*, *OpenAI*, *Anthropic*, or *Ollama*).
    *   Input your API Key. It will be encrypted using AES-256-GCM and saved locally.
3.  **Register a Local Project:**
    *   Go to **Projects** and click **New Project**.
    *   Provide a name and enter the absolute path to your local project directory (e.g., `/Users/username/projects/my-app`).
4.  **Launch a Discussion Session:**
    *   Click **Start New Session**.
    *   Select a template (e.g., *Feature Planning*) and provide a goal or requirement (e.g., *"Design an auth system using NextAuth"*).
    *   Watch the PM, Architect, and Engineer agents analyze your codebase, debate solutions, and automatically compile a `planning.md` file for you!

---

## 🔒 Security & Data Privacy

*   **API Key Encryption:** Your provider API keys are encrypted at rest using AES-256-GCM. The encryption key is randomly generated on the first run and stored in the local file `[root]/.secret`.

## Local Security Model

Rapat AI is intended to run on the same computer as the browser. The default
`dev` and `start` commands listen only on `127.0.0.1`; do not override this with
`0.0.0.0`, a public tunnel, port forwarding, or an internet-facing reverse
proxy.

Provider API keys and MCP environment values are write-only. Saved values are
encrypted in SQLite and are never returned to the browser. Custom provider
URLs may use HTTP only on loopback; public custom providers must use HTTPS.
Private LAN and cloud metadata destinations are rejected.

Treat `.secret` and the SQLite database as one backup unit. Restoring the
database without its matching `.secret` file makes encrypted credentials
unrecoverable. Keep `.secret`, `.env`, and database files readable only by your
OS user (`chmod 600 .secret .env prisma/dev.db` on Unix-like systems).
*   **Workspace Protection:** Workspace operations (reads, listings, searches, and writes) are strictly confined to the registered project root:
    *   **Root Confinement:** The resolver rejects absolute paths, directory traversal attacks (`..`), null bytes, and all symlinks (including dangling ones) that point outside the project root boundary.
    *   **No-Follow Protection:** Final output writes enforce the `O_NOFOLLOW` flag to prevent writing through destination symlinks.
    *   **Immutable Exclusions:** Hard-denies sensitive files/folders—such as `.git`, `.env` / `.env.*`, `.secret`, key/certificate files (`*.pem`, `*.key`, `*.p12`, `*.pfx`), SQLite databases and journals (`*.db`, `*.sqlite`, `*-journal`), build/dependencies folders (`dist`, `build`, `out`, `node_modules`, `.next`), and `.rapat-ai` configurations. Custom negation rules (e.g., `!node_modules`) are blocked from re-enabling these paths.
    *   **Integrated Ignores:** Automatically loads and merges the project's `.gitignore` file with custom project ignore rules, executing standard `.gitignore` semantics.
*   **Database Isolation:** All configurations, projects, and discussions are kept locally inside your private `prisma/dev.db` database.
