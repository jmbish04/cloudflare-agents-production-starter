import { getAgentByName } from 'agents';
import { MyAgent } from './agents/MyAgent';
import { SupervisorAgent } from './agents/SupervisorAgent';
// Export the Env type for use in Agent classes
export type { WorkerEnv } from './types';
import type { WorkerEnv } from './types';

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Simple URL-based router
      if (path.startsWith('/agent/my-agent/')) {
        // Handler for CORE-001 & CORE-004
        const agentId = path.split('/').pop()!;
        const agent = await getAgentByName<WorkerEnv, MyAgent>(env.MY_AGENT, agentId);
        return agent.onRequest(request);
      }

      if (path === '/rpc-hello') {
        // Handler for CORE-002
        const agent = await getAgentByName<WorkerEnv, MyAgent>(env.MY_AGENT, "my-unique-id");
        const greeting = await agent.sayHello("World");
        return new Response(greeting);
      }

      if (path === '/dispatch-task' && request.method === 'POST') {
        // Handler for CORE-003
        try {
          const { url: taskUrl } = await request.json() as { url: string };
          const supervisor = await getAgentByName<WorkerEnv, SupervisorAgent>(env.SUPERVISOR, "global-supervisor");
          return supervisor.doComplexTask(taskUrl);
        } catch (jsonError) {
          return new Response("Invalid JSON payload", { status: 400 });
        }
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

// Re-export Agent classes for wrangler.jsonc to find them
export { MyAgent } from './agents/MyAgent';
export { SupervisorAgent } from './agents/SupervisorAgent';
export { WorkerAgent } from './agents/WorkerAgent';