import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
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

vi.mock('./agents/MyAgent', () => ({
  MyAgent: class MockMyAgent {},
}));

vi.mock('./agents/SupervisorAgent', () => ({
  SupervisorAgent: class MockSupervisorAgent {},
}));

vi.mock('./agents/WorkerAgent', () => ({
  WorkerAgent: class MockWorkerAgent {},
}));

vi.mock('./agents/HistoryAgent', () => ({
  HistoryAgent: class MockHistoryAgent {},
}));

vi.mock('./agents/CounterAgent', () => ({
  CounterAgent: class MockCounterAgent {},
}));

vi.mock('./agents/MigratingAgent', () => ({
  MigratingAgent: class MockMigratingAgent {},
}));

// Get mocked function
import { getAgentByName } from 'agents';
const mockedGetAgentByName = vi.mocked(getAgentByName);

describe('Worker Integration Tests', () => {
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

  describe('GET /agent/my-agent/{agentId}', () => {
    it('should route to MyAgent.onRequest', async () => {
      mockedGetAgentByName.mockResolvedValue(mockMyAgent);
      
      const request = new Request('http://localhost/agent/my-agent/test-agent-123');
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.MY_AGENT, 'test-agent-123');
      expect(mockMyAgent.onRequest).toHaveBeenCalledWith(request);
      expect(await response.text()).toBe('Hello from Agent!');
    });

    it('should handle different agent IDs', async () => {
      mockedGetAgentByName.mockResolvedValue(mockMyAgent);
      
      const request = new Request('http://localhost/agent/my-agent/different-agent-456');
      await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.MY_AGENT, 'different-agent-456');
    });
  });

  describe('GET /rpc-hello', () => {
    it('should call MyAgent.sayHello and return greeting', async () => {
      mockedGetAgentByName.mockResolvedValue(mockMyAgent);
      
      const request = new Request('http://localhost/rpc-hello');
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.MY_AGENT, 'my-unique-id');
      expect(mockMyAgent.sayHello).toHaveBeenCalledWith('World');
      expect(await response.text()).toBe('Hello, World!');
    });
  });

  describe('POST /dispatch-task', () => {
    it('should delegate task to SupervisorAgent', async () => {
      mockedGetAgentByName.mockResolvedValue(mockSupervisorAgent);
      
      const requestBody = { url: 'https://example.com/test-task' };
      const request = new Request('http://localhost/dispatch-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.SUPERVISOR, 'global-supervisor');
      expect(mockSupervisorAgent.doComplexTask).toHaveBeenCalledWith('https://example.com/test-task');
      expect(response.status).toBe(202);
      expect(await response.text()).toBe('Worker dispatched.');
    });

    it('should handle JSON parsing', async () => {
      mockedGetAgentByName.mockResolvedValue(mockSupervisorAgent);
      
      const requestBody = { url: 'https://example.com/json-test' };
      const request = new Request('http://localhost/dispatch-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockSupervisorAgent.doComplexTask).toHaveBeenCalledWith('https://example.com/json-test');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('http://localhost/unknown-route');
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should return 404 for wrong HTTP methods', async () => {
      const request = new Request('http://localhost/dispatch-task', { method: 'GET' });
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });
  });

  describe('URL parsing', () => {
    it('should correctly extract agent ID from URL path', async () => {
      mockedGetAgentByName.mockResolvedValue(mockMyAgent);
      
      const request = new Request('http://localhost/agent/my-agent/complex-agent-id-with-dashes');
      await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.MY_AGENT, 'complex-agent-id-with-dashes');
    });

    it('should handle URLs with query parameters', async () => {
      mockedGetAgentByName.mockResolvedValue(mockMyAgent);
      
      const request = new Request('http://localhost/agent/my-agent/test-agent?param=value');
      await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.MY_AGENT, 'test-agent');
    });
  });
});