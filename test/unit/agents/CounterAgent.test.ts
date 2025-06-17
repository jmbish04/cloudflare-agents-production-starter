import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CounterAgent } from '../../../src/agents/CounterAgent';
import type { WorkerEnv } from '../../../src/types';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-counter-agent';
    public env: any = {};
    public state: any = { counter: 0 };
    public initialState = { counter: 0 };
    
    constructor(name?: string) {
      if (name) this.name = name;
    }
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
  }
  
  class TestConnection {
    public id = 'test-connection';
    public messages: string[] = [];
    
    send(message: string) {
      this.messages.push(message);
    }
    
    close() {
      // Mock close method
    }
  }
  
  return { Agent: TestAgent, Connection: TestConnection };
});

describe('CounterAgent', () => {
  let agent: CounterAgent;
  let mockConnection: any;

  beforeEach(() => {
    agent = new CounterAgent();
    agent.state = { counter: 0 };
    
    mockConnection = {
      id: 'test-connection',
      messages: [],
      send: vi.fn((message: string) => mockConnection.messages.push(message)),
      close: vi.fn()
    };
  });

  describe('initialState', () => {
    it('should have counter set to 0', () => {
      expect(agent.initialState).toEqual({ counter: 0 });
    });
  });

  describe('onConnect', () => {
    it('should send current state to connection', async () => {
      agent.state = { counter: 5 };
      await agent.onConnect(mockConnection);
      
      expect(mockConnection.send).toHaveBeenCalledWith('{"counter":5}');
    });
  });

  describe('onMessage', () => {
    it('should increment counter by 1 when increment command received', async () => {
      const command = JSON.stringify({ op: 'increment' });
      await agent.onMessage(mockConnection, command);
      
      expect(agent.state.counter).toBe(1);
    });

    it('should increment counter by custom value', async () => {
      const command = JSON.stringify({ op: 'increment', value: 5 });
      await agent.onMessage(mockConnection, command);
      
      expect(agent.state.counter).toBe(5);
    });

    it('should decrement counter by 1 when decrement command received', async () => {
      agent.state = { counter: 10 };
      const command = JSON.stringify({ op: 'decrement' });
      await agent.onMessage(mockConnection, command);
      
      expect(agent.state.counter).toBe(9);
    });

    it('should decrement counter by custom value', async () => {
      agent.state = { counter: 10 };
      const command = JSON.stringify({ op: 'decrement', value: 3 });
      await agent.onMessage(mockConnection, command);
      
      expect(agent.state.counter).toBe(7);
    });

    it('should send error for unknown command', async () => {
      const command = JSON.stringify({ op: 'unknown' });
      await agent.onMessage(mockConnection, command);
      
      expect(mockConnection.send).toHaveBeenCalledWith('{"error":"Unknown command: unknown"}');
    });

    it('should send error for invalid JSON', async () => {
      const invalidJson = 'invalid json';
      await agent.onMessage(mockConnection, invalidJson);
      
      expect(mockConnection.send).toHaveBeenCalledWith('{"error":"Invalid command format"}');
    });
  });

  describe('increment', () => {
    it('should increment counter by 1', async () => {
      await agent.increment();
      expect(agent.state.counter).toBe(1);
    });

    it('should increment from existing value', async () => {
      agent.state = { counter: 5 };
      await agent.increment();
      expect(agent.state.counter).toBe(6);
    });
  });

  describe('getState', () => {
    it('should return current state', async () => {
      agent.state = { counter: 42 };
      const state = await agent.getState();
      expect(state).toEqual({ counter: 42 });
    });
  });

  describe('onStateUpdate', () => {
    it('should log state update from server', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      agent.onStateUpdate({ counter: 5 }, 'server');
      
      expect(consoleSpy).toHaveBeenCalledWith('State updated to 5 by server');
      consoleSpy.mockRestore();
    });

    it('should log state update from connection', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const connection = { id: 'conn-123' } as any;
      
      agent.onStateUpdate({ counter: 3 }, connection);
      
      expect(consoleSpy).toHaveBeenCalledWith('State updated to 3 by conn-123');
      consoleSpy.mockRestore();
    });
  });

  describe('onRequest', () => {
    it('should handle POST /increment and return updated state', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id/increment', {
        method: 'POST'
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual({ counter: 1 });
    });

    it('should handle GET /state and return current state', async () => {
      agent.state = { counter: 7 };
      const request = new Request('http://example.com/agent/counter-agent/test-id/state', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual({ counter: 7 });
    });

    it('should handle GET /{id} and return current state', async () => {
      agent.state = { counter: 3 };
      const request = new Request('http://example.com/agent/counter-agent/test-id', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual({ counter: 3 });
    });

    it('should return 404 for unknown paths', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id/unknown', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not found');
    });

    it('should return 404 for unsupported method', async () => {
      const request = new Request('http://example.com/agent/counter-agent/test-id/increment', {
        method: 'DELETE'
      });
      
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(404);
    });
  });
});