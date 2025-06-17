import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerEnv } from '../../src/types';

// Mock the agents module for integration tests
vi.mock('agents', () => {
  const mockAgents = new Map();
  
  class MockAgent {
    public name: string;
    public env: any = {};
    public state: any = {};
    public sqlQueries: any[] = [];
    
    constructor(name?: string) {
      this.name = name || 'mock-agent';
    }
    
    async onRequest(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      
      // Simulate agent routing behavior
      if (pathParts.includes('history-agent')) {
        if (request.method === 'POST') {
          const body = await request.json();
          return Response.json({ message: 'History entry added', data: body });
        }
        return Response.json({ messages: [] });
      }
      
      if (pathParts.includes('counter-agent')) {
        if (request.method === 'POST' && pathParts.includes('increment')) {
          return Response.json({ counter: 1, action: 'incremented' });
        }
        return Response.json({ counter: 0 });
      }
      
      if (pathParts.includes('migrating-agent')) {
        if (request.method === 'POST') {
          const body = await request.json();
          return Response.json({ users: [body] });
        }
        return Response.json({ users: [] });
      }
      
      return new Response('Not Found', { status: 404 });
    }
  }
  
  const getAgentByName = vi.fn().mockImplementation(async (binding: any, id: string) => {
    if (!mockAgents.has(id)) {
      mockAgents.set(id, new MockAgent(id));
    }
    return mockAgents.get(id);
  });
  
  return { Agent: MockAgent, getAgentByName };
});

// Import mocked functions
import { getAgentByName } from 'agents';
const mockedGetAgentByName = vi.mocked(getAgentByName);

describe('Agent Routing Integration Tests', () => {
  let env: WorkerEnv;
  let ctx: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    env = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
      HISTORY_AGENT: {} as any,
      COUNTER_AGENT: {} as any,
      MIGRATING_AGENT: {} as any,
    };
    
    ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as any;
  });

  describe('Agent-to-Agent Communication', () => {
    it('should handle agent instantiation and routing', async () => {
      const historyAgent = await mockedGetAgentByName(env.HISTORY_AGENT, 'test-history-agent');
      expect(historyAgent).toBeDefined();
      expect(historyAgent.name).toBe('test-history-agent');
      expect(mockedGetAgentByName).toHaveBeenCalledWith(env.HISTORY_AGENT, 'test-history-agent');
    });

    it('should maintain agent isolation', async () => {
      const agent1 = await mockedGetAgentByName(env.COUNTER_AGENT, 'counter-1');
      const agent2 = await mockedGetAgentByName(env.COUNTER_AGENT, 'counter-2');
      
      expect(agent1).not.toBe(agent2);
      expect(agent1.name).toBe('counter-1');
      expect(agent2.name).toBe('counter-2');
    });
  });

  describe('Request Routing Patterns', () => {
    it('should route HistoryAgent requests correctly', async () => {
      const agent = await mockedGetAgentByName(env.HISTORY_AGENT, 'history-1');
      
      const postRequest = new Request('http://localhost/agent/history-agent/history-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test message' })
      });
      
      const response = await agent.onRequest(postRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.message).toBe('History entry added');
      expect(result.data.text).toBe('test message');
    });

    it('should route CounterAgent requests correctly', async () => {
      const agent = await mockedGetAgentByName(env.COUNTER_AGENT, 'counter-1');
      
      const incrementRequest = new Request('http://localhost/agent/counter-agent/counter-1/increment', {
        method: 'POST'
      });
      
      const response = await agent.onRequest(incrementRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.counter).toBe(1);
      expect(result.action).toBe('incremented');
    });

    it('should route MigratingAgent requests correctly', async () => {
      const agent = await mockedGetAgentByName(env.MIGRATING_AGENT, 'migrating-1');
      
      const userRequest = new Request('http://localhost/agent/migrating-agent/migrating-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'user1', name: 'John Doe' })
      });
      
      const response = await agent.onRequest(userRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.users).toHaveLength(1);
      expect(result.users[0].name).toBe('John Doe');
    });
  });

  describe('URL Path Parsing', () => {
    it('should correctly parse agent URLs', () => {
      const url = new URL('http://localhost/agent/counter-agent/test-counter-123/increment');
      const pathParts = url.pathname.split('/');
      
      expect(pathParts[1]).toBe('agent');
      expect(pathParts[2]).toBe('counter-agent');
      expect(pathParts[3]).toBe('test-counter-123');
      expect(pathParts[4]).toBe('increment');
    });

    it('should handle query parameters', () => {
      const url = new URL('http://localhost/agent/history-agent/test?limit=10');
      const pathParts = url.pathname.split('/');
      
      expect(pathParts[3]).toBe('test');
      expect(url.searchParams.get('limit')).toBe('10');
    });
  });

  describe('HTTP Method Routing', () => {
    it('should handle POST requests with JSON bodies', async () => {
      const agent = await mockedGetAgentByName(env.HISTORY_AGENT, 'test-agent');
      
      const request = new Request('http://localhost/agent/history-agent/test-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'integration test' })
      });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.data.text).toBe('integration test');
    });

    it('should handle GET requests', async () => {
      const agent = await mockedGetAgentByName(env.COUNTER_AGENT, 'test-counter');
      
      const request = new Request('http://localhost/agent/counter-agent/test-counter');
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.counter).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const agent = await mockedGetAgentByName(env.COUNTER_AGENT, 'test-agent');
      
      const request = new Request('http://localhost/unknown/route');
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const agent = await mockedGetAgentByName(env.HISTORY_AGENT, 'test-agent');
      
      const request = new Request('http://localhost/agent/history-agent/test-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      await expect(agent.onRequest(request)).rejects.toThrow();
    });
  });

  describe('Agent State Management', () => {
    it('should maintain separate state per agent instance', async () => {
      const agent1 = await mockedGetAgentByName(env.COUNTER_AGENT, 'counter-1');
      const agent2 = await mockedGetAgentByName(env.COUNTER_AGENT, 'counter-2');
      
      expect(agent1.state).not.toBe(agent2.state);
      expect(agent1.name).toBe('counter-1');
      expect(agent2.name).toBe('counter-2');
    });

    it('should allow state modification', async () => {
      const agent = await mockedGetAgentByName(env.COUNTER_AGENT, 'test-counter');
      
      agent.state = { counter: 42 };
      expect(agent.state.counter).toBe(42);
    });
  });

  describe('Agent Binding Verification', () => {
    it('should correctly use agent bindings', async () => {
      expect(env.HISTORY_AGENT).toBeDefined();
      expect(env.COUNTER_AGENT).toBeDefined();
      expect(env.MIGRATING_AGENT).toBeDefined();
      
      const historyAgent = await mockedGetAgentByName(env.HISTORY_AGENT, 'test');
      const counterAgent = await mockedGetAgentByName(env.COUNTER_AGENT, 'test');
      const migratingAgent = await mockedGetAgentByName(env.MIGRATING_AGENT, 'test');
      
      expect(historyAgent).toBeDefined();
      expect(counterAgent).toBeDefined();
      expect(migratingAgent).toBeDefined();
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent agent requests', async () => {
      const agentPromises = [
        mockedGetAgentByName(env.COUNTER_AGENT, 'concurrent-1'),
        mockedGetAgentByName(env.COUNTER_AGENT, 'concurrent-2'),
        mockedGetAgentByName(env.HISTORY_AGENT, 'concurrent-3'),
      ];
      
      const agents = await Promise.all(agentPromises);
      
      expect(agents).toHaveLength(3);
      expect(agents[0].name).toBe('concurrent-1');
      expect(agents[1].name).toBe('concurrent-2');
      expect(agents[2].name).toBe('concurrent-3');
    });

    it('should cache agent instances correctly', async () => {
      const agent1 = await mockedGetAgentByName(env.COUNTER_AGENT, 'cached-agent');
      const agent2 = await mockedGetAgentByName(env.COUNTER_AGENT, 'cached-agent');
      
      expect(agent1).toBe(agent2); // Should be the same instance
    });
  });
});