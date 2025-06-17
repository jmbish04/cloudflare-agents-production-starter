# Cloudflare Agents: Tactical Development Guide

This guide provides project-specific, tactical information for developing with Cloudflare Agents. It is a dense summary of core concepts, coding standards, and required patterns. Adhere to these principles for all contributions.

## 1. Core Concepts & Rules

-   **Agent = Durable Object:** An Agent is a stateful, single-threaded actor, globally addressable by a unique ID. All requests to a single Agent instance are processed serially.
-   **The "Hot Agent" Problem is a Design Failure:** A single Agent instance that receives high-frequency writes becomes a system bottleneck.
    -   **Rule:** Never create a system-wide singleton Agent.
    -   **Rule:** High-throughput Agents **must** act as routers. They perform minimal validation, immediately delegate work via RPC to ephemeral "Task Agents," and return. Their own execution time per request must be in milliseconds.
-   **Configuration is Code:** An Agent is not usable without explicit declaration in `wrangler.jsonc`.
    -   `durable_objects.bindings`: Declares the Agent class and its binding name.
    -   `migrations.new_sqlite_classes`: **Mandatory** to enable the `this.sql` database for an Agent class.

```jsonc
// wrangler.jsonc: Minimal Configuration
{
  "durable_objects": {
    "bindings": [{ "name": "MY_AGENT", "class_name": "MyAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyAgent"] }]
}
```

## 2. Project Structure

```
.
├── src
│   ├── agents/              # Agent class definitions (e.g., UserAgent.ts, TaskAgent.ts)
│   ├── ui/                  # React components for frontend
│   ├── client/              # Plain JS client logic
│   └── index.ts             # Worker entrypoint (Hono router, routeAgentRequest)
├── test
│   └── index.spec.ts        # Vitest integration tests
└── wrangler.jsonc           # Project manifest & configuration
```

## 3. State Management Patterns

State is a built-in, two-tiered system. Using the wrong tier for a given data type is an anti-pattern.

### Tier 1: Reactive UI State (`this.state`)

-   **Use Case:** Small, JSON-serializable objects that directly drive a UI. (e.g., `{ unreadCount: 5, status: 'online' }`).
-   **Mechanism:** `this.setState()` replaces the entire state object and automatically pushes the new state to all clients connected via the `useAgent` hook.
-   **RULE: Atomic Updates via Command Pattern.** Clients **must not** send full state objects. They send commands, which the Agent processes serially. This guarantees atomic read-modify-write cycles.

```typescript
// Agent-side command processing
async onMessage(connection: Connection, message: string) {
  const command = JSON.parse(message);
  if (command.op === 'increment') {
    this.setState({ counter: this.state.counter + 1 });
  }
}

// Client-side command sending
agent.send(JSON.stringify({ op: 'increment' }));
```

-   **ANTI-PATTERN:** Storing large arrays or deeply nested objects in `this.state`. Full rewrites are inefficient. For lists (e.g., chat messages), store them in SQL and only put metadata (e.g., `messageCount`) in `this.state`.

### Tier 2: Durable SQL Memory (`this.sql`)

-   **Use Case:** All large, structured, relational, or archival data. This is the Agent's long-term memory.
-   **Mechanism:** Zero-latency, embedded SQLite database accessed via a tagged template literal.
-   **RULE: Lazy Schema Migration.** The Agent is responsible for its own schema evolution. On startup, check a version and apply migrations sequentially.

```typescript
// onStart() method in Agent class
async onStart() {
  this.sql`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER)`;
  const [{ value: version }] = this.sql`SELECT value FROM _meta WHERE key = 'version'` || [{ value: 0 }];
  if (version < 1) {
    this.sql`CREATE TABLE users (id TEXT, name TEXT)`;
    this.sql`INSERT INTO _meta (key, value) VALUES ('version', 1)`;
  }
  if (version < 2) {
    this.sql`ALTER TABLE users ADD COLUMN email TEXT`;
    this.sql`UPDATE _meta SET value = 2 WHERE key = 'version'`;
  }
}
```

## 4. Communication Protocols

| Direction                  | Primary Protocol                                                              | Secondary Protocol                             |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| **Client ↔ Agent**         | **WebSockets** (for bi-directional, interactive, stateful comms)                | **HTTP/SSE** (for one-way server->client stream) |
| **Worker/Agent → Agent**   | **RPC** (`getAgentByName`)                                                    | N/A                                            |

-   **WebSocket Server:** Implement `onConnect`, `onMessage`, `onClose`, `onError`.
-   **React Client:** Use the `useAgent` hook.
-   **JS Client:** Use the `AgentClient` class from `agents/client`.
-   **RPC:** Ensure type safety by defining the `AgentNamespace<MyAgent>` in the `Env` interface.

```typescript
// Type-safe RPC from a Worker
interface Env { MY_AGENT: AgentNamespace<MyAgent>; }

export default {
  async fetch(req, env: Env) {
    const agent = await getAgentByName(env.MY_AGENT, "my-unique-id");
    const result = await agent.someMethod("param"); // Fully typed
    return new Response(result);
  }
}
```

## 5. Core Architectural Patterns

### Authentication: Gateway Pattern

-   **RULE:** Auth logic **MUST** live in the entrypoint Worker, *before* the Agent is invoked. Use the hooks in `routeAgentRequest` or Hono middleware. Do not put auth logic inside Agent methods.

```typescript
// In worker's fetch handler
return await routeAgentRequest(request, env, {
  onBeforeConnect: (req) => { // For WebSockets
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
  },
});
```

### RAG: SQL is Source of Truth

-   The external vector index (Vectorize) is a **rebuildable cache**. The Agent's internal SQL DB is the **canonical source of truth**.
-   **Ingestion Flow:**
    1.  `INSERT` content into Agent's SQL DB, get back a unique `id`.
    2.  Generate embedding for the content.
    3.  `INSERT` vector into Vectorize, with metadata `{ "id": sql_id }`.
-   **Query Flow:**
    1.  Embed user query.
    2.  Search Vectorize, get back matches with metadata.
    3.  Extract `id`s from metadata.
    4.  `SELECT content FROM documents WHERE id IN (...)` from the Agent's own SQL DB.
    5.  Augment LLM prompt with the full content from SQL.
-   **Consistency Pattern: On-Read Cleanup.** If a vector search returns an ID that is not found in the SQL lookup (a stale pointer), the Agent must gracefully ignore it and dispatch a background task to delete the invalid ID from Vectorize.

### AI Model Selection: Classifier-Router Pattern

-   **RULE:** Avoid calling expensive LLMs for simple tasks.
-   **Flow:**
    1.  **Classify:** Send user input to a fast, cheap, fine-tuned model on Workers AI to get an `intent` and `entities`.
    2.  **Route:** Use a `switch` statement on the `intent`.
        -   If `intent` is a known tool (e.g., `get_weather`), call a simple local method with the `entities`.
        -   If `intent` is `complex_reasoning`, escalate to a powerful model (GPT-4, Claude 3) via AI Gateway.

### External Tools: Secure Wrapper Pattern

-   **RULE:** All external API calls must be wrapped in a dedicated Agent method.
    1.  Store API keys using `wrangler secret`. Access via `this.env`.
    2.  Wrap the `fetch` call in a `try/catch` block.
    3.  Check `response.ok` and handle non-2xx status codes gracefully.
    4.  Return a predictable result or throw a well-defined internal error.

```typescript
// In an Agent class
async getGitHubRepo(repoName: string) {
  try {
    const res = await fetch(`...`, { headers: { 'Authorization': `Bearer ${this.env.GH_TOKEN}` }});
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  } catch (e) {
    this.log("error", "github.api.failed", "...", { error: e });
    return null;
  }
}
```

## 6. Testing & Observability

### Testing

-   **Framework:** Use `vitest` with `@cloudflare/vitest-pool-workers` for high-fidelity tests running in the `workerd` runtime.
-   **Pattern:** Test stateful transitions. In a single test case, send multiple requests to the *same Agent ID* and assert that state changes correctly between calls.
-   **Mocking:** Use `msw` or `vi.spyOn(global, 'fetch')` to mock external API calls for deterministic, fast tests.

### Observability

-   **RULE:** All logs **MUST** be structured JSON. Create a logging helper.
-   **Required Fields:** Every log event must contain:
    -   `timestamp` (ISO 8601)
    -   `agentClass` (e.g., `UserAgent`)
    -   `agentId` (`this.name`)
    -   `traceId` (propagated correlation ID)
    -   `eventType` (namespaced, e.g., `rpc.request.received`, `error.api.failed`)
    -   `level` (`info`, `warn`, `error`)
    -   `message` (human-readable)
    -   `data` (optional object with context)
-   **Aggregation:** Use Cloudflare Logpush to export these structured logs to a monitoring platform.

## 7. Model Context Protocol (MCP)

-   **Base Class:** Extend `McpAgent` from `agents/mcp`.
-   **Tools:** Define tools in the `init()` method (e.g., `this.server.tool(...)`).
-   **State:**
    -   `this.state` / `this.setState`: **Ephemeral per-connection state.** It is reset for every new client connection.
    -   `this.sql`: **Durable cross-session state.** Data written here persists for the lifetime of the Agent instance, across all connections.
-   **Security:** Production MCP servers MUST be secured. Use the `@cloudflare/workers-oauth-provider` library to wrap the `McpAgent` and handle the OAuth 2.1 flow.