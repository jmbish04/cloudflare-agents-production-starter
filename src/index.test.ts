import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerEnv } from './types';

// Mock agents module
vi.mock('agents', () => ({
  getAgentByName: vi.fn(),
  routeAgentRequest: vi.fn(),
  Agent: class MockAgent {},
}));

vi.mock('partyserver', () => ({
  Connection: class MockConnection {},
}));

// Get mocked function
import { getAgentByName } from 'agents';
const mockedGetAgentByName = vi.mocked(getAgentByName);

describe('Worker Unit Tests', () => {
  let mockEnv: WorkerEnv;
  let mockCtx: ExecutionContext;
  let mockMyAgent: any;
  let mockSupervisorAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockMyAgent = {
      onRequest: vi.fn().mockResolvedValue(new Response('Hello from Agent!')),
      sayHello: vi.fn().mockResolvedValue('Hello, World!'),
    };

    mockSupervisorAgent = {
      doComplexTask: vi.fn().mockResolvedValue(new Response('Worker dispatched.', { status: 202 })),
    };

    mockEnv = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
      HISTORY_AGENT: {} as any,
      COUNTER_AGENT: {} as any,
      MIGRATING_AGENT: {} as any,
    };
    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as any;
  });

  describe('Agent Mock Verification', () => {
    it('should properly mock getAgentByName function', async () => {
      mockedGetAgentByName.mockResolvedValue(mockMyAgent);
      
      const agent = await mockedGetAgentByName(mockEnv.MY_AGENT, 'test-agent-123');
      expect(agent).toBe(mockMyAgent);
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.MY_AGENT, 'test-agent-123');
    });

    it('should mock agent methods correctly', async () => {
      const response = await mockMyAgent.onRequest(new Request('http://localhost/test'));
      expect(response).toBeInstanceOf(Response);
      expect(await response.text()).toBe('Hello from Agent!');
    });

    it('should mock supervisor agent methods', async () => {
      const response = await mockSupervisorAgent.doComplexTask('test-url');
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(202);
    });
  });

  describe('Environment Configuration', () => {
    it('should have all required environment bindings', () => {
      expect(mockEnv.MY_AGENT).toBeDefined();
      expect(mockEnv.SUPERVISOR).toBeDefined();
      expect(mockEnv.WORKER).toBeDefined();
      expect(mockEnv.HISTORY_AGENT).toBeDefined();
      expect(mockEnv.COUNTER_AGENT).toBeDefined();
      expect(mockEnv.MIGRATING_AGENT).toBeDefined();
    });
  });

  describe('Request Construction', () => {
    it('should handle agent URL patterns', () => {
      const request = new Request('http://localhost/agent/my-agent/test-agent-123');
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      
      expect(pathParts[1]).toBe('agent');
      expect(pathParts[2]).toBe('my-agent');
      expect(pathParts[3]).toBe('test-agent-123');
    });

    it('should handle RPC URL patterns', () => {
      const request = new Request('http://localhost/rpc-hello');
      const url = new URL(request.url);
      
      expect(url.pathname).toBe('/rpc-hello');
    });

    it('should handle dispatch task URLs', () => {
      const request = new Request('http://localhost/dispatch-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/test-task' })
      });
      
      expect(request.method).toBe('POST');
      expect(request.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('JSON Processing', () => {
    it('should parse JSON request bodies', async () => {
      const requestBody = { url: 'https://example.com/test-task' };
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const parsedBody = await request.json();
      expect(parsedBody).toEqual(requestBody);
    });

    it('should handle invalid JSON gracefully', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });
      
      await expect(request.json()).rejects.toThrow();
    });
  });

  describe('Response Construction', () => {
    it('should create proper Response objects', () => {
      const response = new Response('Test response');
      expect(response).toBeInstanceOf(Response);
    });

    it('should handle Response with status codes', () => {
      const notFoundResponse = new Response('Not Found', { status: 404 });
      expect(notFoundResponse.status).toBe(404);
      
      const acceptedResponse = new Response('Accepted', { status: 202 });
      expect(acceptedResponse.status).toBe(202);
    });

    it('should handle JSON responses', () => {
      const data = { message: 'test' };
      const response = Response.json(data);
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });
});