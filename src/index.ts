import { Hono } from 'hono';
import { getAgentByName } from 'agents';
import { AuthAgent } from './agents/AuthAgent';
import { MyAgent } from './agents/MyAgent';
import { SupervisorAgent } from './agents/SupervisorAgent';
import { HistoryAgent } from './agents/HistoryAgent';
import { CounterAgent } from './agents/CounterAgent';
import { MigratingAgent } from './agents/MigratingAgent';
import { EchoAgent } from './agents/EchoAgent';
import { StreamingAgent } from './agents/StreamingAgent';
import { ChattyAgent } from './agents/ChattyAgent';
import { ReminderAgent } from './agents/ReminderAgent';
import { ScheduleManagerAgent } from './agents/ScheduleManagerAgent';
import { OnboardingAgent } from './agents/OnboardingAgent';
import { UserAgentV1 } from './agents/UserAgentV1';
import { UserAgentV2 } from './agents/UserAgentV2';
import { PaymentAgentV1 } from './agents/PaymentAgentV1';
export type { WorkerEnv } from './types';
import type { WorkerEnv } from './types';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Auth Gateway Middleware
app.use('/api/secure/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const expectedToken = `Bearer ${c.env.VALID_BEARER_TOKEN}`;
  if (authHeader !== expectedToken) {
    return c.text('Unauthorized', 401);
  }
  await next();
});

// WebSocket helper function
async function setupWebSocket<T>(
  env: any,
  agentBinding: any,
  agentId: string,
  agentClass: new (...args: any[]) => T
): Promise<Response> {
  const agent = await getAgentByName(agentBinding, agentId);
  
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);
  
  server.accept();
  
  const connection = {
    id: `conn-${Date.now()}`,
    send: (message: string) => server.send(message),
    close: () => server.close(),
    setState: (state: any) => { (connection as any).state = state; },
    state: null
  };
  
  server.addEventListener('message', async (event) => {
    try {
      await (agent as any).onMessage(connection as any, event.data as string);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  server.addEventListener('close', async (event) => {
    try {
      await (agent as any).onClose?.(connection as any, event.code || 1000, event.reason || '', event.wasClean || true);
    } catch (error) {
      console.error('WebSocket close error:', error);
    }
  });
  
  server.addEventListener('error', async (event) => {
    try {
      await (agent as any).onError?.(connection as any, new Error('WebSocket error'));
    } catch (error) {
      console.error('WebSocket error handler error:', error);
    }
  });
  
  try {
    await (agent as any).onConnect?.(connection as any);
  } catch (error) {
    console.error('WebSocket connect error:', error);
  }
  
  return new Response(null, { status: 101, webSocket: client });
}

// WebSocket routes
app.get('/counter-agent/:id', async (c) => {
  if (c.req.header('upgrade') === 'websocket') {
    const agentId = c.req.param('id');
    return setupWebSocket(c.env, c.env.COUNTER_AGENT, agentId, CounterAgent);
  }
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, CounterAgent>(c.env.COUNTER_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.get('/agent/counter-agent/:id', async (c) => {
  if (c.req.header('upgrade') === 'websocket') {
    const agentId = c.req.param('id');
    return setupWebSocket(c.env, c.env.COUNTER_AGENT, agentId, CounterAgent);
  }
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, CounterAgent>(c.env.COUNTER_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.get('/echo-agent/:id', async (c) => {
  if (c.req.header('upgrade') === 'websocket') {
    const agentId = c.req.param('id');
    return setupWebSocket(c.env, c.env.ECHO_AGENT, agentId, EchoAgent);
  }
  return new Response("Not Found", { status: 404 });
});

app.get('/chatty-agent/:id', async (c) => {
  if (c.req.header('upgrade') === 'websocket') {
    const agentId = c.req.param('id');
    return setupWebSocket(c.env, c.env.CHATTY_AGENT, agentId, ChattyAgent);
  }
  return new Response("Not Found", { status: 404 });
});

// Core API routes
app.get('/agent/my-agent/:id', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, MyAgent>(c.env.MY_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.get('/rpc-hello', async (c) => {
  const agent = await getAgentByName<WorkerEnv, MyAgent>(c.env.MY_AGENT, "my-unique-id");
  const greeting = await agent.sayHello("World");
  return new Response(greeting);
});

app.post('/dispatch-task', async (c) => {
  try {
    const { url: taskUrl } = await c.req.json() as { url: string };
    const supervisor = await getAgentByName<WorkerEnv, SupervisorAgent>(c.env.SUPERVISOR, "global-supervisor");
    return supervisor.doComplexTask(taskUrl);
  } catch (jsonError) {
    return new Response("Invalid JSON payload", { status: 400 });
  }
});

// Versioned API routes
app.get('/v1/user/:id', async (c) => {
  const agent = await getAgentByName<WorkerEnv, UserAgentV1>(c.env.USER_AGENT_V1, c.req.param('id'));
  return c.json(await agent.getProfile());
});

app.post('/v2/user/:id/upgrade', async (c) => {
  const agent = await getAgentByName<WorkerEnv, UserAgentV2>(c.env.USER_AGENT_V2, c.req.param('id'));
  return c.json(await agent.upgradeSubscription());
});

// Protected routes with authentication
app.get('/api/secure/data', (c) => {
  return c.json({ secret: 'The vault is open.' });
});

// Secure WebSocket connection
app.get('/api/secure/ws/connect/:id', async (c) => {
  if (c.req.header('upgrade') === 'websocket') {
    const agentId = c.req.param('id');
    return setupWebSocket(c.env, c.env.AUTH_AGENT, agentId, AuthAgent);
  }
  return new Response('WebSocket upgrade required', { status: 400 });
});

// State management agents
app.all('/agent/history-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, HistoryAgent>(c.env.HISTORY_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.all('/counter-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, CounterAgent>(c.env.COUNTER_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.all('/agent/counter-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, CounterAgent>(c.env.COUNTER_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.all('/agent/migrating-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, MigratingAgent>(c.env.MIGRATING_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.all('/streaming-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, StreamingAgent>(c.env.STREAMING_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

// Orchestration agents
app.all('/agent/reminder-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, ReminderAgent>(c.env.REMINDER_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.all('/agent/schedule-manager-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, ScheduleManagerAgent>(c.env.SCHEDULE_MANAGER_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.all('/agent/onboarding-agent/:id/*', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, OnboardingAgent>(c.env.ONBOARDING_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

// Custom 404 handler to match original behavior
app.notFound((c) => {
  return new Response("Not Found", { status: 404 });
});

// Error handler to match original behavior
app.onError((err, c) => {
  console.error('Worker error:', err);
  return new Response("Internal Server Error", { status: 500 });
});

export default app;

// Re-export Agent classes for wrangler.jsonc to find them
export { MyAgent } from './agents/MyAgent';
export { SupervisorAgent } from './agents/SupervisorAgent';
export { WorkerAgent } from './agents/WorkerAgent';
export { HistoryAgent } from './agents/HistoryAgent';
export { CounterAgent } from './agents/CounterAgent';
export { MigratingAgent } from './agents/MigratingAgent';
export { EchoAgent } from './agents/EchoAgent';
export { StreamingAgent } from './agents/StreamingAgent';
export { ChattyAgent } from './agents/ChattyAgent';
export { ReminderAgent } from './agents/ReminderAgent';
export { ScheduleManagerAgent } from './agents/ScheduleManagerAgent';
export { OnboardingAgent } from './agents/OnboardingAgent';
export { AuthAgent } from './agents/AuthAgent';
export { UserAgentV1 } from './agents/UserAgentV1';
export { UserAgentV2 } from './agents/UserAgentV2';
export { PaymentAgentV1 } from './agents/PaymentAgentV1';
export { EmailWorkflow } from './workflows/EmailWorkflow';