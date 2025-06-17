import { Agent } from "agents";
import type { WorkerEnv } from "../types";

export class WorkerAgent extends Agent<WorkerEnv> {
  /**
   * Performs the actual (simulated) long-running work.
   * Implements spec: CORE-003
   */
  async scrape(url: string): Promise<void> {
    const startTime = Date.now();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      agentClass: 'WorkerAgent',
      agentId: (this as any).name,
      eventType: 'scrape_start',
      level: 'info',
      message: `Worker starting scrape`,
      data: { url, startTime }
    }));
    
    try {
      // Simulate a long-running task
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'WorkerAgent',
        agentId: (this as any).name,
        eventType: 'scrape_complete',
        level: 'info',
        message: `Worker finished scrape`,
        data: { url, startTime, endTime, duration }
      }));
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'WorkerAgent',
        agentId: (this as any).name,
        eventType: 'scrape_error',
        level: 'error',
        message: `Worker scrape failed`,
        data: { url, startTime, endTime, duration, error: String(error) }
      }));
      
      throw error;
    }
  }
}