import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyAgent } from './MyAgent';
import type { WorkerEnv } from '../types';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-agent';
    public env: any = {};
    constructor(name?: string) {
      if (name) this.name = name;
    }
  }
  return { Agent: TestAgent };
});

describe('MyAgent', () => {
  let agent: MyAgent;
  let mockEnv: WorkerEnv;

  beforeEach(() => {
    mockEnv = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
    };
    agent = new MyAgent() as any;
    (agent as any).name = 'test-agent';
    (agent as any).env = mockEnv;
  });

  describe('onRequest', () => {
    it('should return "Hello from Agent!" response', async () => {
      const mockRequest = new Request('http://localhost/test');
      
      const response = await agent.onRequest(mockRequest);
      
      expect(response).toBeInstanceOf(Response);
      expect(await response.text()).toBe('Hello from Agent!');
    });
  });

  describe('sayHello', () => {
    it('should return greeting with provided name', async () => {
      const result = await agent.sayHello('World');
      
      expect(result).toBe('Hello, World!');
    });

    it('should handle empty string name', async () => {
      const result = await agent.sayHello('');
      
      expect(result).toBe('Hello, !');
    });

    it('should handle special characters in name', async () => {
      const result = await agent.sayHello('Test & User');
      
      expect(result).toBe('Hello, Test & User!');
    });
  });

  describe('onStart', () => {
    it('should log startup message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onStart();
      
      expect(consoleSpy).toHaveBeenCalledWith('Agent test-agent starting up for the first time.');
      consoleSpy.mockRestore();
    });
  });
});