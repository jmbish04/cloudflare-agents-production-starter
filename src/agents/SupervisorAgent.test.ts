import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupervisorAgent } from './SupervisorAgent';
import type { WorkerEnv } from '../types';

// Mock agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-agent';
    public env: any = {};
    constructor(name?: string) {
      if (name) this.name = name;
    }
  }
  return {
    Agent: TestAgent,
    getAgentByName: vi.fn(),
  };
});

// Get mocked function
import { getAgentByName } from 'agents';
const mockedGetAgentByName = vi.mocked(getAgentByName);

describe('SupervisorAgent', () => {
  let agent: SupervisorAgent;
  let mockEnv: WorkerEnv;
  let mockWorkerAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockWorkerAgent = {
      scrape: vi.fn().mockResolvedValue(undefined),
    };
    
    mockedGetAgentByName.mockResolvedValue(mockWorkerAgent);
    mockEnv = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
    };
    agent = new SupervisorAgent() as any;
    (agent as any).name = 'test-supervisor';
    (agent as any).env = mockEnv;
  });

  describe('doComplexTask', () => {
    it('should delegate task to worker and return 202 response', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const testUrl = 'https://example.com/test';
      
      const response = await agent.doComplexTask(testUrl);
      
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(202);
      expect(await response.text()).toBe('Worker dispatched.');
      
      consoleSpy.mockRestore();
    });

    it('should use deterministic worker ID based on URL', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const testUrl = 'https://example.com/test-page';
      const expectedWorkerId = `worker-for-${encodeURIComponent(testUrl)}`;
      
      await agent.doComplexTask(testUrl);
      
      expect(mockedGetAgentByName).toHaveBeenCalledWith(mockEnv.WORKER, expectedWorkerId);
      consoleSpy.mockRestore();
    });

    it('should call worker.scrape without awaiting', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const testUrl = 'https://example.com/test';
      
      await agent.doComplexTask(testUrl);
      
      expect(mockWorkerAgent.scrape).toHaveBeenCalledWith(testUrl);
      consoleSpy.mockRestore();
    });

    it('should log delegation message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const testUrl = 'https://example.com/special-chars?param=value';
      const expectedWorkerId = `worker-for-${encodeURIComponent(testUrl)}`;
      
      await agent.doComplexTask(testUrl);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        `Supervisor test-supervisor dispatched task for URL ${testUrl} to worker ${expectedWorkerId}`
      );
      consoleSpy.mockRestore();
    });

    it('should handle URLs with special characters', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const testUrl = 'https://example.com/path with spaces & symbols?query=test';
      
      const response = await agent.doComplexTask(testUrl);
      
      expect(response.status).toBe(202);
      expect(mockedGetAgentByName).toHaveBeenCalledWith(
        mockEnv.WORKER,
        `worker-for-${encodeURIComponent(testUrl)}`
      );
      consoleSpy.mockRestore();
    });
  });
});