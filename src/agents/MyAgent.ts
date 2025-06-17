import { Agent } from "agents";
import type { WorkerEnv } from "../types";

export class MyAgent extends Agent<WorkerEnv, { config: object }> {
  /**
   * Handles direct HTTP requests to this Agent.
   * Implements spec: CORE-001
   */
  async onRequest(request: Request): Promise<Response> {
    return new Response("Hello from Agent!");
  }

  /**
   * A public RPC method callable from the Worker.
   * Implements spec: CORE-002
   */
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  /**
   * A lifecycle hook that runs only once when the Agent is first
   * created or woken from hibernation.
   * Implements spec: CORE-004
   */
  async onStart(): Promise<void> {
    console.log(`Agent ${(this as any).name} starting up for the first time.`);
    
    // SQL schema migration
    (this as any).sql`CREATE TABLE IF NOT EXISTS config (key TEXT, value TEXT)`;
    
    // Example: fetch config from an external source on first start
    try {
      const config = await fetch("https://api.example.com/config").then(r => r.json()) as object;
      this.setState({ config });
    } catch (error) {
      // Fallback to default config
      this.setState({ config: { initialized: true, timestamp: Date.now() } });
    }
  }
}