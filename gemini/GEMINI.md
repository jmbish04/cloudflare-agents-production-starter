GitHub Agent Integration PRD (Expanded)

Overview

This document defines an expanded GitHub Agent architecture to be implemented under @fx2y/cloudflare-agents-production-starter, integrating full-featured GitHub services, task coordination, agent interactions, and workflow orchestration across:
	•	Cloudflare Workers
	•	GitHub APIs (REST + GraphQL)
	•	Durable Object state
	•	R2 file staging and upload pipelines
	•	Job-Master orchestration for CLI-level or headless fallback

⸻

Goals
	1.	Provide robust GitHub API integration via Workers
	2.	Respond to slash commands in PRs/issues/comments with intelligent workflows
	3.	Generate and upload code/configs/CI from Claude or Gemini task outputs
	4.	Bridge GitHub with VM-based job-master CLI tooling
	5.	Allow agents to inspect and modify repo content, open PRs/issues, attach files, and scaffold new repos

⸻

Features

🔧 1. GitHub Slash Command Agent (cf-agent)
	•	Slash commands parsed in PRs, Issues, and Comments
	•	Supported Commands:
	•	/cf-agent review → triggers Gemini or Claude review agent
	•	/cf-agent create tasks → generates GitHub Issues for unresolved comments
	•	/cf-agent create config → generate and PR workflow config files (CI, linting, deploy)
	•	/cf-agent generate file [path] → agent-generated file committed to the repo
	•	/cf-agent commit suggestions → auto-commits any suggested changes
	•	/cf-agent analyze stars → triggers analysis of repo’s starred/forked users

🧱 2. New Repo Generator
	•	Worker receives request to:
	•	Create repo from template
	•	Set visibility, default branch, and team permissions
	•	Add initial files (README, LICENSE, CODEOWNERS, etc.)
	•	Supports optional:
	•	Injecting Claude task-agent setup (claude-task-master)
	•	Including starter-nextjs-convex-ai agent template
	•	Triggering post-creation Gemini setup flow

📦 3. Config & Workflow Generator
	•	Based on repo metadata or user prompt, the worker can:
	•	Create .github/workflows/*.yml files (CI, lint, test, deploy)
	•	Create .eslintrc, tsconfig.json, next.config.js, etc.
	•	Push to branch or make PR via GitHub API
	•	Leverages Claude or Gemini as codex-agent with R2 staging and final commit

📌 4. Comment to Issue Promotion
	•	If a user replies to a PR with /cf-agent create new issues, the worker will:
	•	Parse unresolved Gemini comments
	•	Create separate GitHub Issues with labels, title, and body
	•	Reference the line of code or context
	•	Optionally assign and add to project board

🌐 5. Durable GitHub Agent State
	•	Each repo/project has a Durable Object ID
	•	Tracks agent decisions, PR history, command queue, and logs
	•	Linked to @jmbish04/workflow-live for real-time inspection

🧠 6. Optional CLI Fallback (Job Master)
	•	If a request cannot be fulfilled via GitHub API:
	•	Worker emits task to Job Master
	•	Job Master uses authenticated GitHub CLI via Proxmox VM
	•	Can: clone repo, run local script, create commits, diff, etc.

⸻

Code Modules

cloudflare/worker/github-agent.ts
	•	Entry point for slash command routing
	•	Handles webhook, verifies signature, parses commands

cloudflare/worker/github-service.ts
	•	REST + GraphQL query wrappers
	•	Token scoping, R2-based file staging, retries

cloudflare/worker/codegen-agent.ts
	•	Claude/Gemini-based code generation
	•	R2 file generation
	•	Commit/PR issuing logic

cloudflare/worker/repo-generator.ts
	•	Template repo clone + initial config injection
	•	Repo creation + first commit

cloudflare/worker/config-writer.ts
	•	Based on claude-task-master + prompts
	•	CI, linting, format, deploy workflow templates

⸻

GitHub Agent Slash Command Flow

graph TD
    A[GitHub PR Comment: /cf-agent review] -->|Webhook| B[Cloudflare Worker: github-agent.ts]
    B --> C[GeminiReviewAgent]
    C --> D[Review Suggestions Returned]
    D --> E[If comments → Drop in PR]
    D --> F[If edits → Commit directly or PR]
    E --> G[User types /cf-agent create tasks]
    G --> H[worker parses unresolved comments]
    H --> I[Create GitHub Issues]


⸻

Related Projects
	•	@fx2y/cloudflare-agents-production-starter: main hosting agent orchestrator
	•	@jmbish04/workflow-live: UI viewer of durable agent mindstate
	•	@jmbish04/ai-coding-assistant: task-centric agent scaffolding tool
	•	@jmbish04/github-stars, repo-hunt, agentic-browser: all expose agent-accessible GitHub modules

⸻

Next Steps
	•	Finalize OpenAPI tool definitions for each service
	•	Scaffold code modules from templates
	•	Add durable orchestration logic for GitHub service agents
	•	Register /github/command endpoint in agent system
	•	Connect to job-master for CLI fallbacks and GitHub tasks
