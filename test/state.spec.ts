import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryAgent } from '../src/agents/HistoryAgent';
import { CounterAgent } from '../src/agents/CounterAgent';
import { MigratingAgent } from '../src/agents/MigratingAgent';
import type { WorkerEnv } from '../src/types';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-agent';
    public env: any = {};
    private _state: any = {};
    public sqlQueries: any[] = [];
    
    constructor(name?: string) {
      if (name) this.name = name;
    }
    
    get state() {
      return this._state;
    }
    
    sql(strings: TemplateStringsArray, ...values: any[]) {
      const query = strings.join('?');
      this.sqlQueries.push({ query, values });
      
      // Mock different responses based on query
      if (query.includes('SELECT value FROM _meta WHERE key = \'version\'')) {
        return [{ value: 0 }];
      }
      if (query.includes('SELECT * FROM messages ORDER BY id ASC')) {
        return [{ id: 1, text: 'test message' }];
      }
      if (query.includes('SELECT * FROM users ORDER BY id')) {
        return [{ id: 'user1', name: 'Test User', email: 'test@example.com' }];
      }
      return [];
    }
    
    setState(newState: any) {
      this._state = { ...this._state, ...newState };
    }
  }
  
  class TestConnection {
    public id = 'test-connection';
    public messages: string[] = [];
    
    send(message: string) {
      this.messages.push(message);
    }
  }
  
  return { Agent: TestAgent };
});

vi.mock('partyserver', () => {
  class TestConnection {
    public id = 'test-connection';
    public messages: string[] = [];
    
    send(message: string) {
      this.messages.push(message);
    }
  }
  
  return { Connection: TestConnection };
});

describe('State Management Agents', () => {
  let mockEnv: WorkerEnv;

  beforeEach(() => {
    mockEnv = {} as WorkerEnv;
  });

  describe('HistoryAgent', () => {
    let agent: HistoryAgent;

    beforeEach(() => {
      agent = new HistoryAgent({} as DurableObjectState, mockEnv);
    });

    it('should create messages table on start', async () => {
      await agent.onStart();
      expect((agent as any).sqlQueries).toContainEqual({
        query: 'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, text TEXT)',
        values: []
      });
    });

    it('should add and retrieve messages', async () => {
      await agent.addMessage('Hello World');
      const messages = await agent.getMessages();
      
      expect((agent as any).sqlQueries).toContainEqual({
        query: 'INSERT INTO messages (text) VALUES (?) RETURNING id',
        values: ['Hello World']
      });
      expect(messages).toEqual([{ id: 1, text: 'test message' }]);
    });

    it('should handle POST requests to add messages', async () => {
      const request = new Request('http://test.com', {
        method: 'POST',
        body: JSON.stringify({ text: 'Test message' }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
    });

    it('should handle GET requests to retrieve messages', async () => {
      const request = new Request('http://test.com', { method: 'GET' });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toEqual([{ id: 1, text: 'test message' }]);
    });
  });

  describe('CounterAgent', () => {
    let agent: CounterAgent;

    beforeEach(() => {
      agent = new CounterAgent({} as DurableObjectState, mockEnv);
    });

    it('should initialize with counter at 0', () => {
      expect(agent.initialState).toEqual({ counter: 0 });
    });

    it('should increment counter', async () => {
      agent.setState({ counter: 5 });
      await agent.increment();
      expect(agent.state).toEqual({ counter: 6 });
    });

    it('should handle increment commands via WebSocket', async () => {
      const connection = { id: 'test', send: vi.fn(), messages: [] } as any;
      agent.setState({ counter: 0 });
      
      await agent.onMessage(connection, JSON.stringify({ op: 'increment' }));
      expect(agent.state).toEqual({ counter: 1 });
    });

    it('should handle decrement commands via WebSocket', async () => {
      const connection = { id: 'test', send: vi.fn(), messages: [] } as any;
      agent.setState({ counter: 5 });
      
      await agent.onMessage(connection, JSON.stringify({ op: 'decrement', value: 2 }));
      expect(agent.state).toEqual({ counter: 3 });
    });

    it('should handle invalid commands gracefully', async () => {
      const connection = { id: 'test', send: vi.fn(), messages: [] } as any;
      
      await agent.onMessage(connection, 'invalid json');
      expect(connection.send).toHaveBeenCalledWith(JSON.stringify({ error: 'Invalid command format' }));
    });

    it('should handle POST /increment requests', async () => {
      agent.setState({ counter: 0 });
      const request = new Request('http://test.com/increment', { method: 'POST' });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
      expect(agent.state).toEqual({ counter: 1 });
    });

    it('should handle GET /state requests', async () => {
      agent.setState({ counter: 42 });
      const request = new Request('http://test.com/state', { method: 'GET' });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toEqual({ counter: 42 });
    });

    it('should call onStateUpdate when state changes', async () => {
      const connection = { id: 'test', send: vi.fn(), messages: [] } as any;
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      agent.onStateUpdate({ counter: 1 }, connection);
      expect(consoleSpy).toHaveBeenCalledWith('State updated to 1 by test');
      
      agent.onStateUpdate({ counter: 2 }, 'server');
      expect(consoleSpy).toHaveBeenCalledWith('State updated to 2 by server');
      
      consoleSpy.mockRestore();
    });
  });

  describe('MigratingAgent', () => {
    let agent: MigratingAgent;

    beforeEach(() => {
      agent = new MigratingAgent({} as DurableObjectState, mockEnv);
    });

    it('should create metadata table on start', async () => {
      await agent.onStart();
      expect((agent as any).sqlQueries).toContainEqual({
        query: 'CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER)',
        values: []
      });
    });

    it('should run migrations sequentially', async () => {
      await agent.onStart();
      
      const queries = (agent as any).sqlQueries;
      expect(queries).toContainEqual({
        query: 'CREATE TABLE users (id TEXT, name TEXT)',
        values: []
      });
      expect(queries).toContainEqual({
        query: 'ALTER TABLE users ADD COLUMN email TEXT',
        values: []
      });
    });

    it('should add users successfully after migration', async () => {
      await agent.onStart();
      await agent.addUser('user1', 'Test User', 'test@example.com');
      
      expect((agent as any).sqlQueries).toContainEqual({
        query: 'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
        values: ['user1', 'Test User', 'test@example.com']
      });
    });

    it('should handle migration failure', async () => {
      // Mock SQL to throw error
      (agent as any).sql = () => { throw new Error('Migration failed'); };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await agent.onStart();
      expect((agent as any).migrationFailed).toBe(true);
      
      // Should throw error when trying to use agent
      await expect(agent.addUser('user1', 'Test')).rejects.toThrow('migration failure');
      
      consoleSpy.mockRestore();
    });

    it('should handle requests after successful migration', async () => {
      await agent.onStart();
      const request = new Request('http://test.com', {
        method: 'POST',
        body: JSON.stringify({ id: 'user1', name: 'Test User', email: 'test@test.com' }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
    });

    it('should return 503 when migration failed', async () => {
      (agent as any).migrationFailed = true;
      const request = new Request('http://test.com', { method: 'GET' });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('Agent unavailable due to migration failure');
    });

    it('should validate required fields in POST requests', async () => {
      await agent.onStart();
      const request = new Request('http://test.com', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test User' }), // missing id
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await agent.onRequest(request);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing required fields: id and name are required');
    });
  });
});