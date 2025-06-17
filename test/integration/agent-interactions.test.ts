import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CounterAgent } from '../../src/agents/CounterAgent';
import { HistoryAgent } from '../../src/agents/HistoryAgent';
import { MigratingAgent } from '../../src/agents/MigratingAgent';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-agent';
    public env: any = {};
    public state: any = {};
    public sqlQueries: any[] = [];
    public sqlResults: Record<string, any[]> = {};
    
    constructor(name?: string) {
      if (name) this.name = name;
    }
    
    sql(strings: TemplateStringsArray, ...values: any[]) {
      const query = strings.join('?');
      this.sqlQueries.push({ query, values });
      
      // Mock different responses based on query
      if (query.includes('SELECT value FROM _meta WHERE key = \'version\'')) {
        return this.sqlResults['version'] || [{ value: 0 }];
      }
      if (query.includes('SELECT * FROM messages ORDER BY id ASC')) {
        return this.sqlResults['messages'] || [];
      }
      if (query.includes('SELECT * FROM users ORDER BY id')) {
        return this.sqlResults['users'] || [];
      }
      if (query.includes('INSERT INTO messages') && query.includes('RETURNING id')) {
        return [{ id: this.sqlQueries.length }];
      }
      return [];
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
    
    close() {}
  }
  
  return { Agent: TestAgent, Connection: TestConnection };
});

describe('Agent Interactions Integration Tests', () => {
  let counterAgent: CounterAgent;
  let historyAgent: HistoryAgent;
  let migratingAgent: MigratingAgent;
  let mockConnection: any;

  beforeEach(() => {
    counterAgent = new CounterAgent();
    counterAgent.state = { counter: 0 };
    
    historyAgent = new HistoryAgent();
    historyAgent.sqlQueries = [];
    historyAgent.sqlResults = {};
    
    migratingAgent = new MigratingAgent();
    migratingAgent.sqlQueries = [];
    migratingAgent.sqlResults = {};
    migratingAgent.migrationFailed = false;
    
    mockConnection = {
      id: 'test-connection',
      messages: [],
      send: vi.fn((message: string) => mockConnection.messages.push(message)),
      close: vi.fn()
    };
  });

  describe('Cross-agent state consistency', () => {
    it('should maintain independent state across different agent instances', async () => {
      // Counter agent state
      await counterAgent.increment();
      expect(counterAgent.state.counter).toBe(1);
      
      // History agent should not be affected
      await historyAgent.addMessage('test message');
      expect(historyAgent.sqlQueries).toHaveLength(1);
      expect(counterAgent.state.counter).toBe(1); // Unchanged
      
      // Migrating agent should not be affected
      await migratingAgent.onStart();
      expect(migratingAgent.sqlQueries.length).toBeGreaterThan(0);
      expect(counterAgent.state.counter).toBe(1); // Still unchanged
    });

    it('should handle concurrent operations on different agents', async () => {
      // Simulate concurrent operations
      const operations = await Promise.all([
        counterAgent.increment(),
        historyAgent.addMessage('message 1'),
        migratingAgent.addUser('user1', 'John Doe'),
        counterAgent.increment(),
        historyAgent.addMessage('message 2')
      ]);
      
      expect(counterAgent.state.counter).toBe(2);
      expect(historyAgent.sqlQueries.filter(q => q.query.includes('INSERT INTO messages'))).toHaveLength(2);
      expect(migratingAgent.sqlQueries.filter(q => q.query.includes('INSERT INTO users'))).toHaveLength(1);
    });
  });

  describe('Error propagation and isolation', () => {
    it('should isolate errors between different agents', async () => {
      // Make migrating agent fail
      migratingAgent.migrationFailed = true;
      
      // Counter agent should still work
      await counterAgent.increment();
      expect(counterAgent.state.counter).toBe(1);
      
      // History agent should still work
      await historyAgent.addMessage('test message');
      expect(historyAgent.sqlQueries).toHaveLength(1);
      
      // Migrating agent should fail
      await expect(migratingAgent.addUser('user1', 'John Doe')).rejects.toThrow();
    });

    it('should handle WebSocket errors without affecting HTTP requests', async () => {
      // Simulate WebSocket error
      const invalidCommand = 'invalid json';
      await counterAgent.onMessage(mockConnection, invalidCommand);
      
      expect(mockConnection.send).toHaveBeenCalledWith('{"error":"Invalid JSON format"}');
      
      // HTTP requests should still work
      const request = new Request('http://example.com/agent/counter-agent/test-id/increment', {
        method: 'POST'
      });
      
      const response = await counterAgent.onRequest(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Data persistence simulation', () => {
    it('should simulate data persistence across multiple requests', async () => {
      // Simulate multiple requests to history agent
      historyAgent.sqlResults['messages'] = [];
      
      // First request - add message
      await historyAgent.addMessage('first message');
      historyAgent.sqlResults['messages'].push({ id: 1, text: 'first message' });
      
      // Second request - add another message
      await historyAgent.addMessage('second message');
      historyAgent.sqlResults['messages'].push({ id: 2, text: 'second message' });
      
      // Third request - get all messages
      const messages = await historyAgent.getMessages();
      expect(messages).toEqual([
        { id: 1, text: 'first message' },
        { id: 2, text: 'second message' }
      ]);
    });

    it('should handle migration state transitions correctly', async () => {
      // Start with no version (fresh install)
      migratingAgent.sqlResults['version'] = [];
      await migratingAgent.onStart();
      
      // Should run both migrations
      const migrationQueries = migratingAgent.sqlQueries.filter(q => 
        q.query.includes('CREATE TABLE users') || q.query.includes('ALTER TABLE users')
      );
      expect(migrationQueries).toHaveLength(2);
      
      // Reset and simulate starting from version 1
      migratingAgent.sqlQueries = [];
      migratingAgent.sqlResults['version'] = [{ value: 1 }];
      await migratingAgent.onStart();
      
      // Should only run v2 migration
      const v2MigrationQueries = migratingAgent.sqlQueries.filter(q => 
        q.query.includes('ALTER TABLE users')
      );
      expect(v2MigrationQueries).toHaveLength(1);
    });
  });

  describe('WebSocket and HTTP integration', () => {
    it('should maintain state consistency between WebSocket and HTTP requests', async () => {
      // Initialize counter via HTTP
      const initRequest = new Request('http://example.com/agent/counter-agent/test-id', {
        method: 'GET'
      });
      
      let response = await counterAgent.onRequest(initRequest);
      let state = await response.json();
      expect(state.counter).toBe(0);
      
      // Update via WebSocket
      await counterAgent.onMessage(mockConnection, JSON.stringify({ op: 'increment', value: 5 }));
      expect(counterAgent.state.counter).toBe(5);
      
      // Verify via HTTP
      const checkRequest = new Request('http://example.com/agent/counter-agent/test-id/state', {
        method: 'GET'
      });
      
      response = await counterAgent.onRequest(checkRequest);
      state = await response.json();
      expect(state.counter).toBe(5);
    });

    it('should handle WebSocket connection lifecycle', async () => {
      // Connect
      await counterAgent.onConnect(mockConnection);
      expect(mockConnection.messages).toHaveLength(1);
      expect(JSON.parse(mockConnection.messages[0])).toEqual({ counter: 0 });
      
      // Send commands
      await counterAgent.onMessage(mockConnection, JSON.stringify({ op: 'increment' }));
      await counterAgent.onMessage(mockConnection, JSON.stringify({ op: 'increment', value: 3 }));
      
      expect(counterAgent.state.counter).toBe(4);
      
      // Connection should receive initial state on connect
      expect(mockConnection.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Input validation integration', () => {
    it('should validate inputs across all agent types', async () => {
      // Counter agent validation
      await counterAgent.onMessage(mockConnection, JSON.stringify({ op: 'increment', value: 'invalid' }));
      expect(mockConnection.messages.some(msg => 
        JSON.parse(msg).error?.includes('Invalid command format')
      )).toBe(true);
      
      // History agent validation
      const invalidHistoryRequest = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 123 }) // Invalid type
      });
      
      const historyResponse = await historyAgent.onRequest(invalidHistoryRequest);
      expect(historyResponse.status).toBe(400);
      
      // Migrating agent validation
      await expect(migratingAgent.addUser('', 'Valid Name')).rejects.toThrow('User ID must be a non-empty string');
      await expect(migratingAgent.addUser('valid-id', '')).rejects.toThrow('User name must be a non-empty string');
      await expect(migratingAgent.addUser('valid-id', 'Valid Name', 'invalid-email')).rejects.toThrow('Email must be a valid email address');
    });
  });
});