import { Agent, getAgentByName } from "agents";
import type { WorkerEnv } from "../types";
import type { WorkerAgent } from "./WorkerAgent";

export class SupervisorAgent extends Agent<WorkerEnv> {
  /**
   * Delegates a task to an ephemeral WorkerAgent without awaiting the result.
   * Implements spec: CORE-003
   */
  async doComplexTask(url: string): Promise<Response> {
    // Use a deterministic ID for the worker to ensure idempotency
    const workerId = `worker-for-${encodeURIComponent(url)}`;
    const worker = await getAgentByName<WorkerEnv, WorkerAgent>((this as any).env.WORKER, workerId);

    // Fire-and-forget: Do NOT await this call.
    // The Supervisor's job is done once the task is delegated.
    worker.scrape(url);

    console.log(`Supervisor ${(this as any).name} dispatched task for URL ${url} to worker ${workerId}`);
    return new Response("Worker dispatched.", { status: 202 });
  }
}