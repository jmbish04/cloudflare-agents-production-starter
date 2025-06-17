# Cloudflare Agents: Tactical Guide

Dense, project-specific development patterns. Adherence is mandatory.

## 1. Core Model & Config

-   **Agent is a Durable Object:** A stateful, single-threaded actor, globally addressable by ID. Requests are processed serially.
-   **"Hot Agent" is a Design Failure:** High-frequency write targets are bottlenecks.
    -   **RULE:** No system-wide singleton agents.
    -   **RULE:** High-throughput agents **MUST** be non-blocking routers: minimal validation, fire-and-forget RPC to Task Agents, immediate return.
-   **Config is Code (`wrangler.jsonc`):**
    -   `durable_objects.bindings` declares the class and its binding name.
    -   `migrations.new_sqlite_classes` is **mandatory** to enable `this.sql`.

## 2. State: Two Tiers

### Tier 1: `this.state` (Reactive UI State)

-   **Use Case:** Small, volatile, UI-driving JSON.
-   **Mechanism:** `this.setState()` replaces the entire object, auto-pushes to clients using the `useAgent` hook.
-   **RULE: Command Pattern for Atomic Updates.** Clients send commands, not state. The agent's serial processing guarantees atomicity.
    ```typescript
    // Agent:
    if (cmd.op === 'inc') this.setState({ ctr: this.state.ctr + 1 });
    // Client:
    agent.send(JSON.stringify({ op: 'inc' }));
    ```
-   **ANTI-PATTERN:** Storing lists/large objects. Use SQL for those; `this.state` should only hold metadata (e.g., counts, timestamps).

### Tier 2: `this.sql` (Durable SQL Memory)

-   **Use Case:** Large, structured, archival, relational data.
-   **Mechanism:** Zero-latency embedded SQLite via `this.sql` tagged template literal.
-   **RULE: Lazy Schema Migration.** In the `onStart()` hook, check a schema version from a meta table and apply migrations sequentially.
    ```typescript
    async onStart() {
      this.sql`CREATE TABLE IF NOT EXISTS _meta (key TEXT, val INT)`;
      const [{ val: ver }] = this.sql`SELECT val FROM _meta WHERE key='ver'`||[{val:0}];
      if (ver < 1) { /* ...migration SQL... */ }
      if (ver < 2) { /* ...migration SQL... */ }
    }
    ```

## 3. Communication & RPC

| Direction              | Protocol                               | Notes                                          |
| ---------------------- | -------------------------------------- | ---------------------------------------------- |
| **Client ↔ Agent**     | **WebSockets** (Primary)               | Bi-directional, stateful. Use `useAgent` hook. |
| **Server → Client**    | **HTTP/SSE** (Secondary)               | One-way streaming (e.g., LLM responses).       |
| **Worker/Agent → Agent** | **RPC** (`getAgentByName`)             | Server-to-server calls.                        |

-   **RPC Type Safety:** Use `AgentNamespace<MyAgent>` in the `Env` interface.
    ```typescript
    interface Env { MY_AGENT: AgentNamespace<MyAgent>; }
    const agent = await getAgentByName(env.MY_AGENT, "id");
    const result = await agent.someMethod(); // Fully typed
    ```

## 4. Required Architectural Patterns

### Auth: Gateway in Worker

-   Auth logic **MUST** be in the entrypoint Worker, **NOT** in Agent methods.
-   Use `onBeforeConnect` (WebSockets) / `onBeforeRequest` (HTTP) hooks in `routeAgentRequest` to reject unauthenticated requests before the Agent is invoked.

### RAG: SQL is Truth

-   Vectorize is a cache; the Agent's SQL DB is the canonical source.
-   **Ingestion:**
    1.  `INSERT` to SQL, get `id`.
    2.  Embed content.
    3.  `INSERT` to Vectorize with `metadata: { id: sql_id }`.
-   **Query:**
    1.  Embed query.
    2.  Search Vectorize, get `id`s from metadata.
    3.  `SELECT` full content from SQL using `id`s.
    4.  Augment LLM prompt.
-   **Consistency:** On SQL lookup miss (stale vector pointer), ignore the result and dispatch a background task to delete the invalid vector ID from Vectorize.

### AI: Classifier-Router

-   Don't use expensive LLMs for simple tasks.
-   **Flow:**
    1.  **Classify:** Use a fast/cheap Workers AI model to determine `intent`.
    2.  **Route:** `switch(intent)` to either a simple local tool or escalate to a powerful LLM (via AI Gateway).

### External Tools: Secure Wrapper

-   Wrap all external `fetch` calls in dedicated, resilient Agent methods.
    1.  Store keys in `wrangler secret`, access via `this.env`.
    2.  Wrap `fetch` in `try/catch`.
    3.  Check `response.ok` to handle HTTP errors.
    4.  Log errors and return a predictable value (e.g., `null`).

## 5. Testing & Observability

### Testing

-   Use `vitest` + `@cloudflare/vitest-pool-workers` for high-fidelity tests.
-   **Pattern:** Test stateful transitions by hitting the *same Agent ID* multiple times within a single test case.
-   Mock external `fetch` calls with `msw` for fast, deterministic tests.

### Observability

-   Logs **MUST** be structured JSON. Use a logging helper.
-   **Required Fields:** `timestamp`, `agentClass`, `agentId`, `traceId`, `eventType`, `level`, `message`, `data`.
-   Aggregate all logs using Cloudflare Logpush.

## 6. Model Context Protocol (MCP)

-   `extends McpAgent`. Define tools in the `init()` method.
-   **State:**
    -   `this.state`: **Ephemeral**, per-connection. Resets on new connection.
    -   `this.sql`: **Durable**, cross-session. Persists for the Agent instance.
-   **Security:** Production servers **MUST** be wrapped with `@cloudflare/workers-oauth-provider` for OAuth 2.1.