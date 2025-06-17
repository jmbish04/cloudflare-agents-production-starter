import { Agent } from "agents";
import type { WorkerEnv } from "../types";

export class MyAgent extends Agent<WorkerEnv> {
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
    // This is where one-time initialization, like DB schema creation, would go.
  }
}