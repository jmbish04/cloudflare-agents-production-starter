import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerAgent } from './WorkerAgent';
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

describe('WorkerAgent', () => {
  let agent: WorkerAgent;
  let mockEnv: WorkerEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
    };
    agent = new WorkerAgent() as any;
    (agent as any).name = 'test-worker';
    (agent as any).env = mockEnv;
  });

  describe('scrape', () => {
    it('should log structured start and finish messages', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.useFakeTimers();
      
      const testUrl = 'https://example.com/test';
      const scrapePromise = agent.scrape(testUrl);
      
      // Fast-forward through the 5-second delay
      await vi.advanceTimersByTimeAsync(5000);
      await scrapePromise;
      
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      
      // Verify structured logging format
      const startCall = consoleSpy.mock.calls[0][0];
      const endCall = consoleSpy.mock.calls[1][0];
      
      const startLog = JSON.parse(startCall);
      const endLog = JSON.parse(endCall);
      
      expect(startLog.agentClass).toBe('WorkerAgent');
      expect(startLog.eventType).toBe('scrape_start');
      expect(startLog.data.url).toBe(testUrl);
      
      expect(endLog.agentClass).toBe('WorkerAgent');
      expect(endLog.eventType).toBe('scrape_complete');
      expect(endLog.data.url).toBe(testUrl);
      expect(endLog.data.duration).toBe(5000);
      
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should simulate 5-second delay', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.useFakeTimers();
      
      const testUrl = 'https://example.com/delay-test';
      const startTime = Date.now();
      
      const scrapePromise = agent.scrape(testUrl);
      
      // Advance time by 4.9 seconds - should not be finished yet
      await vi.advanceTimersByTimeAsync(4900);
      
      // Advance the remaining 0.1 seconds to complete the delay
      await vi.advanceTimersByTimeAsync(100);
      await scrapePromise;
      
      const endTime = Date.now();
      expect(endTime - startTime).toBe(5000);
      
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should handle URLs with special characters', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.useFakeTimers();
      
      const testUrl = 'https://example.com/path with spaces & symbols?query=test';
      const scrapePromise = agent.scrape(testUrl);
      
      await vi.advanceTimersByTimeAsync(5000);
      await scrapePromise;
      
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      
      const startCall = consoleSpy.mock.calls[0][0];
      const endCall = consoleSpy.mock.calls[1][0];
      
      const startLog = JSON.parse(startCall);
      const endLog = JSON.parse(endCall);
      
      expect(startLog.data.url).toBe(testUrl);
      expect(endLog.data.url).toBe(testUrl);
      
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should return void', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.useFakeTimers();
      
      const testUrl = 'https://example.com/void-test';
      const scrapePromise = agent.scrape(testUrl);
      
      await vi.advanceTimersByTimeAsync(5000);
      const result = await scrapePromise;
      
      expect(result).toBeUndefined();
      
      consoleSpy.mockRestore();
      vi.useRealTimers();
    });
  });
});