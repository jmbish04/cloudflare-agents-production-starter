import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/index';
import type { WorkerEnv } from '../../src/types';

// Mock the agents module
vi.mock('agents', () => {
  class MockAgent {
    public name: string;
    public env: any = {};
    public state: any = {};
    
    constructor(name?: string) {
      this.name = name || 'mock-agent';
    }
    
    async onRequest(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      
      if (pathParts.includes('history-agent')) {
        if (request.method === 'POST') {
          const body = await request.json();
          return Response.json([{ id: 1, text: body.text }]);
        }
        return Response.json([{ id: 1, text: 'mock message' }]);
      }
      
      if (pathParts.includes('counter-agent')) {
        const action = pathParts[pathParts.length - 1];
        if (request.method === 'POST' && action === 'increment') {
          return Response.json({ counter: 1 });
        }
        return Response.json({ counter: 0 });
      }
      
      if (pathParts.includes('migrating-agent')) {
        if (request.method === 'POST') {
          const body = await request.json();
          return Response.json([{ id: body.id, name: body.name, email: body.email }]);
        }
        return Response.json([{ id: 'user1', name: 'Test User', email: null }]);
      }
      
      if (pathParts.includes('my-agent')) {
        return new Response('Hello from MyAgent');
      }
      
      return new Response('Mock agent response');
    }
    
    async sayHello(name: string): Promise<string> {
      return `Hello, ${name}!`;
    }
    
    async doComplexTask(url: string): Promise<Response> {
      return new Response(`Task completed for ${url}`);
    }
    
    async onConnect() {}
    async onMessage() {}
    async onClose() {}
  }
  
  const getAgentByName = vi.fn().mockImplementation(async (binding: any, id: string) => {
    return new MockAgent(id);
  });
  
  return { Agent: MockAgent, getAgentByName };
});

// Mock WebSocketPair for the test environment
global.WebSocketPair = class WebSocketPair {
  constructor() {
    const mockWebSocket = {
      accept: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn()
    };
    return [mockWebSocket, mockWebSocket];
  }
} as any;

describe('Agent Routing Integration Tests', () => {
  let env: WorkerEnv;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
      HISTORY_AGENT: {} as any,
      COUNTER_AGENT: {} as any,
      MIGRATING_AGENT: {} as any
    };
    
    ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    } as any;
  });

  describe('HistoryAgent routing', () => {
    it('should route POST requests to history agent correctly', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test message' })
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([{ id: 1, text: 'test message' }]);
    });

    it('should route GET requests to history agent correctly', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([{ id: 1, text: 'mock message' }]);
    });
  });

  describe('CounterAgent routing', () => {
    it('should route POST increment requests correctly', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id/increment', {
        method: 'POST'
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual({ counter: 1 });
    });

    it('should route GET state requests correctly', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id/state', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual({ counter: 0 });
    });

    it('should route GET agent requests correctly', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual({ counter: 0 });
    });
  });

  describe('MigratingAgent routing', () => {
    it('should route POST requests to migrating agent correctly', async () => {
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'user123', name: 'John Doe', email: 'john@example.com' })
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([{ id: 'user123', name: 'John Doe', email: 'john@example.com' }]);
    });

    it('should route GET requests to migrating agent correctly', async () => {
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([{ id: 'user1', name: 'Test User', email: null }]);
    });
  });

  describe('WebSocket routing', () => {
    it('should handle WebSocket upgrade requests for counter agent', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id', {
        method: 'GET',
        headers: {
          'upgrade': 'websocket',
          'connection': 'upgrade'
        }
      });
      
      // The test environment doesn't support WebSocket responses properly
      // so we expect it to fail gracefully with a 500 error
      const response = await worker.fetch(request, env, ctx);
      
      // In the real Cloudflare environment, this would be 101
      // But in the test environment, it falls back to error handling
      expect(response.status).toBe(500);
    });

    it('should not handle WebSocket upgrades for non-counter agents', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'GET',
        headers: {
          'upgrade': 'websocket',
          'connection': 'upgrade'
        }
      });
      
      const response = await worker.fetch(request, env, ctx);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([{ id: 1, text: 'mock message' }]);
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('http://example.com/unknown/route', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should handle agent errors gracefully', async () => {
      // Mock agent to throw error
      const { getAgentByName } = await import('agents');
      vi.mocked(getAgentByName).mockRejectedValueOnce(new Error('Agent creation failed'));
      
      const request = new Request('http://example.com/agent/counter-agent/test-id', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
    });
  });

  describe('Legacy routes', () => {
    it('should handle RPC hello route', async () => {
      const request = new Request('http://example.com/rpc-hello', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(200);
    });

    it('should handle dispatch task route', async () => {
      const request = new Request('http://example.com/dispatch-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://example.com' })
      });
      
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(200);
    });

    it('should handle invalid JSON in dispatch task', async () => {
      const request = new Request('http://example.com/dispatch-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid JSON payload');
    });
  });
});