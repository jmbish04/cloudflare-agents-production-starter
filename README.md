# Cloudflare Agents: Production Starter Kit

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Cloudflare-orange)

This project is a comprehensive, production-grade starter kit and architectural showcase for building next-generation AI applications using **Cloudflare Agents**. It provides a set of robust, well-tested patterns that move beyond simple demos to address the real-world challenges of scalability, state management, security, and long-term maintainability.

Traditional serverless functions are stateless, making it difficult to build interactive, conversational AI systems that require memory and context. This starter kit implements a **"Stateful Serverless"** model that co-locates state and compute, enabling low-latency, persistent AI interactions on a globally distributed network.

This repository is designed to be the definitive starting point for any serious Agent-based development on Cloudflare.

## Key Features & Unique Selling Points

This starter kit is not just a collection of code; it's an opinionated implementation of battle-tested architectural patterns.

*   **⚡ Stateful Serverless Core:** Built on Cloudflare Durable Objects, each Agent is a globally addressable, single-threaded compute entity with persistent state, eliminating the need for slow external session databases.
*   **🧠 Two-Tiered State Management:**
    *   **Reactive UI State (`this.state`):** A high-level state object for small, volatile data that automatically synchronizes with React UIs via the `useAgent` hook, enabling effortless real-time interactivity.
    *   **Zero-Latency SQL (`this.sql`):** Each Agent instance possesses its own private, embedded SQLite database for storing large volumes of structured, archival data (e.g., chat history, user files). Reads and writes are memory-speed, incurring no network latency.
*   **Scalability by Design: The Agent Topology Pattern:**
    *   Avoids the "Hot Agent" problem by design. Long-lived **"Digital Twin"** agents act as orchestrators, delegating heavy computation to ephemeral, short-lived **"Task Agents"**. This ensures the core state machine remains responsive under load.
*   **🤖 Production-Ready RAG Workflow:** A complete, canonical implementation for Retrieval Augmented Generation. It uses the Agent's internal SQL as the source of truth and an external vector database (like Cloudflare Vectorize) as a rebuildable cache, with built-in strategies for maintaining data consistency.
*   **🛡️ Security First: The Authentication Gateway Model:** Enforces a non-negotiable security boundary. Authentication and authorization logic lives in the entrypoint Worker, ensuring no unauthenticated request can ever access or create an Agent instance.
*   **🕰️ Autonomous Operations:** Agents can be truly proactive. A built-in, durable scheduling API (`this.schedule`) allows an Agent to schedule future executions of its own methods, from simple delays to complex cron-based recurring tasks.
*   **🧩 Rich Interactivity Patterns:**
    *   **Human-in-the-Loop (HITL):** Go beyond simple approval. Pause an Agent, notify a human, and allow them to engage in a live, conversational intervention session to guide or override the Agent's next steps.
    *   **Model Context Protocol (MCP):** Serve an Agent's capabilities as a set of stateful tools to compliant AI clients like Claude or Cursor, turning your Agent into a powerful, persistent backend for external AI systems.
*   **🔬 High-Fidelity Testing & Observability:**
    *   Includes a complete testing setup using `vitest-pool-workers` to run tests in the actual `workerd` runtime, enabling reliable testing of stateful transitions.
    *   Mandates a structured JSON logging format with required fields (`agentId`, `traceId`, etc.) for comprehensive system-level monitoring when paired with Cloudflare Logpush.

## The Agent Model: A Deeper Dive

At its core, an Agent is an abstraction over a Cloudflare Durable Object, providing three key guarantees:

1.  **Unique Identity:** Every Agent instance has a unique, addressable ID. All requests for that ID are routed to the exact same instance globally.
2.  **Persistence:** An Agent's state (both in-memory and in its SQL database) and code live beyond a single request. It can be activated on-demand and persist for years.
3.  **Single-Threaded Execution:** Each Agent processes incoming events serially, eliminating data races within an instance.

### The Agent Topology Pattern

To build scalable systems, you **must not** create monolithic Agents. The core design philosophy is a **topology of interacting actors**.

*   **The "Digital Twin" Agent:** This is your long-lived orchestrator, representing a core entity like a user or a chat room. Its job is to manage canonical state and delegate work. When it receives a request requiring computation, it **must immediately** spawn an Ephemeral Task Agent and return, keeping its own event loop free.
*   **The "Ephemeral Task" Agent:** A lightweight, short-lived worker created to execute a single, isolated job (e.g., "scrape this URL," "summarize this document"). It performs the actual work and reports back to its parent.

## Architectural Patterns & Usage

This starter kit provides working examples for the most critical agentic patterns.

### 1. Two-Tiered State Management

**Rule:** Use the right tier for the right data.

*   **Tier 1: Reactive UI State (`this.state`)**
    For small data driving a UI. Updates are made atomically using the **Command Pattern**.

    ```typescript
    // In your Agent class
    // Client sends: { op: 'increment' }
    async onMessage(connection: Connection, message: string) {
      const command = JSON.parse(message);
      if (command.op === 'increment') {
        // Atomic read-modify-write, guaranteed by the single-threaded event loop
        this.setState({ counter: this.state.counter + 1 });
      }
    }
    ```

*   **Tier 2: Durable SQL Memory (`this.sql`)**
    For all historical or large structured data. Implement the **Lazy Migration Pattern** to evolve your schema safely.

    ```typescript
    // In your Agent's onStart() method
    async onStart() {
      // Check a version number from a meta table
      // and apply migrations sequentially.
      this.sql`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT, content TEXT)`;
    }
    
    // In an RPC method
    public async addMessage(role: string, content: string) {
        await this.sql`INSERT INTO messages (role, content) VALUES (${role}, ${content})`;
    }
    ```

### 2. Real-time UIs with `useAgent`

The `useAgent` hook in `agents/react` abstracts away all WebSocket complexity.

```tsx
// In a React Component
import { useAgent } from 'agents/react';

function Chat({ agentName }: { agentName: string }) {
  // state is the Agent's `this.state`, automatically updated
  // agent is a typed stub for calling RPC methods
  const { state, agent } = useAgent({
    agent: 'MyChatAgent',
    name: agentName
  });

  return (
    <div>
      <p>Unread Messages: {state.unreadCount}</p>
      <button onClick={() => agent.markAsRead()}>Mark as Read</button>
    </div>
  );
}
```

### 3. Retrieval Augmented Generation (RAG)

The RAG workflow treats the Agent's internal SQL as the canonical source of truth.

1.  **Ingestion:**
    1.  `INSERT` full document into Agent's SQL database, getting a unique `id`.
    2.  Generate vector embedding for the document.
    3.  `INSERT` the vector into Cloudflare Vectorize, storing the SQL `id` in the vector's metadata.
2.  **Query:**
    1.  Embed the user's query.
    2.  Search Vectorize to get the top N matching vectors and their metadata.
    3.  Extract the `id`s from the metadata.
    4.  `SELECT` the full document text from the Agent's internal SQL using the retrieved `id`s.
    5.  Augment the final LLM prompt with the full text.

### 4. Autonomous Scheduling

Agents can act on their own timeline without external triggers.

```typescript
// In an Agent method
public async scheduleFollowUp(userId: string, delayInSeconds: number) {
  // Schedule this.sendFollowUpEmail to run after the delay
  await this.schedule(delayInSeconds, 'sendFollowUpEmail', { userId });
  
  // Or schedule a recurring task with a cron string
  await this.schedule('* * * * *', 'runHourlyReport');
}

public async sendFollowUpEmail(payload: { userId: string }) {
  // ... logic to send an email ...
}
```

### 5. Secure External Tool Usage

All external API calls must be wrapped in a secure and resilient method.

```typescript
// In an Agent class
async getGitHubRepo(repoName: string) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoName}`, {
      headers: { 
        'Authorization': `Bearer ${this.env.GITHUB_API_KEY}`, // Key from wrangler secret
        'User-Agent': 'MyCloudflareAgent'
      }
    });
    if (!res.ok) {
        // Handle API errors gracefully
        throw new Error(`GitHub API Error: ${res.status}`);
    }
    return res.json();
  } catch (e) {
    // Handle network errors or parsing errors
    this.log("error", "github.api.failed", "Failed to fetch repo", { error: e });
    return null;
  }
}
```

## Getting Started

### Prerequisites

*   Node.js (`v18.0.0` or later)
*   A Cloudflare account
*   `wrangler` CLI (`npm install -g wrangler`)

### 1. Create a New Project

Scaffold a new project using the official starter template.

```bash
npm create cloudflare@latest my-agent-project -- --template=cloudflare/agents-starter
```

### 2. Local Development

Navigate into your new project directory and start the local development server. This runs a high-fidelity simulation of the Cloudflare runtime, including Agents (Durable Objects), secrets, and service bindings.

```bash
cd my-agent-project
npx wrangler dev
```

You can now interact with your Agent on `http://localhost:8787`.

### 3. Managing Secrets

Never commit secrets to your repository. Use `wrangler secret` for production and a `.dev.vars` file for local development.

```bash
# Set a secret for production
npx wrangler secret put MY_API_KEY
# You will be prompted to enter the value

# For local development, create a .dev.vars file:
# .dev.vars
MY_API_KEY="your-local-dev-key"
```

### 4. Deployment

Deploy your Agent to the Cloudflare global network with a single command.

```bash
npx wrangler deploy
```

## Testing & Observability

### Testing

This starter kit is configured with `vitest` and `@cloudflare/vitest-pool-workers`. This runs your tests inside the actual `workerd` runtime for maximum fidelity.

**Pattern:** Test stateful transitions by sending multiple requests to the *same Agent ID* in a single test and asserting the state changes correctly.

```typescript
// in test/index.spec.ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("MyCounterAgent", () => {
  it("should increment a counter across multiple requests", async () => {
    // Use a unique ID for this test run
    const agentId = "test-counter-123";

    // First request should initialize and increment
    const res1 = await SELF.fetch(`http://example.com/agent/MyCounterAgent/${agentId}`, { method: "POST" });
    const { counter: counter1 } = await res1.json();
    expect(counter1).toBe(1);

    // Second request to the same Agent ID should update the existing state
    const res2 = await SELF.fetch(`http://example.com/agent/MyCounterAgent/${agentId}`, { method: "POST" });
    const { counter: counter2 } = await res2.json();
    expect(counter2).toBe(2);
  });
});
```

### Observability

For a distributed system of Agents to be manageable, **structured logging is mandatory**. Every log event must be a JSON object containing these required fields:

*   `timestamp` (ISO 8601)
*   `agentClass` (e.g., `UserAgent`)
*   `agentId` (The unique instance ID)
*   `traceId` (A correlation ID propagated across services)
*   `eventType` (A namespaced string, e.g., `rpc.request.received`)
*   `level` (`info`, `warn`, `error`)
*   `message` (A human-readable summary)
*   `data` (An optional object with context-specific key-value pairs)

These structured logs should be exported via **Cloudflare Logpush** to your preferred observability platform (Datadog, Splunk, S3, etc.) for system-wide analysis.