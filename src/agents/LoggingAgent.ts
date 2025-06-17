import { Agent } from "agents";
import type { WorkerEnv, StructuredLog } from "../types";

export class LoggingAgent extends Agent<WorkerEnv> {
  private log(level: 'info' | 'warn' | 'error' | 'debug', eventType: string, message: string, data: object = {}) {
    const traceId = crypto.randomUUID();
    const logEntry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      agentClass: this.constructor.name,
      agentId: this.name,
      traceId,
      eventType,
      message,
      data,
    };
    console.log(JSON.stringify(logEntry));
  }

  async onRequest(request: Request): Promise<Response> {
    this.log("info", "request.received", "Handling incoming request.", { 
      path: new URL(request.url).pathname,
      method: request.method 
    });
    
    try {
      throw new Error("Simulating an internal failure.");
    } catch (e: any) {
      this.log("error", "operation.failed", "An internal error occurred.", { 
        error: e.message,
        stack: e.stack 
      });
      return new Response("Error logged", { status: 500 });
    }
  }
}