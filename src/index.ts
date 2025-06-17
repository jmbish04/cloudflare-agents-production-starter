import { getAgentByName } from 'agents';
import { MyAgent } from './agents/MyAgent';
import { SupervisorAgent } from './agents/SupervisorAgent';
import { HistoryAgent } from './agents/HistoryAgent';
import { CounterAgent } from './agents/CounterAgent';
import { MigratingAgent } from './agents/MigratingAgent';
// Export the Env type for use in Agent classes
export type { WorkerEnv } from './types';
import type { WorkerEnv } from './types';

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Handle WebSocket upgrades for counter agent
      if (path.startsWith('/agent/counter-agent/') && request.headers.get('upgrade') === 'websocket') {
        const pathParts = path.split('/');
        const agentId = pathParts[3];
        const agent = await getAgentByName<WorkerEnv, CounterAgent>(env.COUNTER_AGENT, agentId);
        
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);
        
        server.accept();
        
        // Create a mock connection that implements the required interface
        const connection = {
          id: `conn-${Date.now()}`,
          send: (message: string) => server.send(message),
          close: () => server.close()
        };
        
        // Handle WebSocket events
        server.addEventListener('message', async (event) => {
          try {
            await agent.onMessage(connection as any, event.data as string);
          } catch (error) {
            console.error('WebSocket message error:', error);
          }
        });
        
        server.addEventListener('close', async (event) => {
          try {
            await agent.onClose?.(connection as any, event.code || 1000, event.reason || '', event.wasClean || true);
          } catch (error) {
            console.error('WebSocket close error:', error);
          }
        });
        
        // Trigger onConnect
        try {
          await agent.onConnect?.(connection as any);
        } catch (error) {
          console.error('WebSocket connect error:', error);
        }
        
        return new Response(null, { status: 101, webSocket: client });
      }

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

      // State management agent routes
      if (path.startsWith('/agent/history-agent/')) {
        const agentId = path.split('/').pop()!;
        const agent = await getAgentByName<WorkerEnv, HistoryAgent>(env.HISTORY_AGENT, agentId);
        return agent.onRequest(request);
      }

      if (path.startsWith('/agent/counter-agent/')) {
        const pathParts = path.split('/');
        const agentId = pathParts[3]; // /agent/counter-agent/{id}/... 
        const agent = await getAgentByName<WorkerEnv, CounterAgent>(env.COUNTER_AGENT, agentId);
        return agent.onRequest(request);
      }

      if (path.startsWith('/agent/migrating-agent/')) {
        const agentId = path.split('/').pop()!;
        const agent = await getAgentByName<WorkerEnv, MigratingAgent>(env.MIGRATING_AGENT, agentId);
        return agent.onRequest(request);
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
export { HistoryAgent } from './agents/HistoryAgent';
export { CounterAgent } from './agents/CounterAgent';
export { MigratingAgent } from './agents/MigratingAgent';