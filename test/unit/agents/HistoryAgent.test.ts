import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryAgent } from '../../../src/agents/HistoryAgent';
import type { WorkerEnv } from '../../../src/types';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-history-agent';
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
      
      // Mock responses based on query pattern
      if (query.includes('CREATE TABLE IF NOT EXISTS messages')) {
        return [];
      }
      if (query.includes('INSERT INTO messages') && query.includes('RETURNING id')) {
        return [{ id: this.sqlQueries.length }];
      }
      if (query.includes('SELECT * FROM messages ORDER BY id ASC')) {
        return this.sqlResults['messages'] || [
          { id: 1, text: 'First message' },
          { id: 2, text: 'Second message' }
        ];
      }
      return [];
    }
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
  }
  
  return { Agent: TestAgent };
});

describe('HistoryAgent', () => {
  let agent: HistoryAgent;

  beforeEach(() => {
    agent = new HistoryAgent();
    agent.sqlQueries = [];
    agent.sqlResults = {};
  });

  describe('onStart', () => {
    it('should create messages table', async () => {
      await agent.onStart();
      
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('CREATE TABLE IF NOT EXISTS messages');
      expect(agent.sqlQueries[0].query).toContain('id INTEGER PRIMARY KEY');
      expect(agent.sqlQueries[0].query).toContain('text TEXT');
    });
  });

  describe('addMessage', () => {
    it('should insert message and return result', async () => {
      const result = await agent.addMessage('Test message');
      
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('INSERT INTO messages (text) VALUES (?) RETURNING id');
      expect(agent.sqlQueries[0].values).toEqual(['Test message']);
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should handle empty message', async () => {
      const result = await agent.addMessage('');
      
      expect(agent.sqlQueries[0].values).toEqual(['']);
      expect(result).toEqual([{ id: 1 }]);
    });

    it('should handle special characters in message', async () => {
      const specialMessage = 'Message with "quotes" and \'apostrophes\' & symbols';
      const result = await agent.addMessage(specialMessage);
      
      expect(agent.sqlQueries[0].values).toEqual([specialMessage]);
    });
  });

  describe('getMessages', () => {
    it('should return all messages ordered by id', async () => {
      const messages = await agent.getMessages();
      
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('SELECT * FROM messages ORDER BY id ASC');
      expect(messages).toEqual([
        { id: 1, text: 'First message' },
        { id: 2, text: 'Second message' }
      ]);
    });

    it('should return empty array when no messages', async () => {
      agent.sqlResults['messages'] = [];
      const messages = await agent.getMessages();
      
      expect(messages).toEqual([]);
    });
  });

  describe('onRequest', () => {
    it('should handle POST request to add message', async () => {
      const requestBody = { text: 'New message' };
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(agent.sqlQueries).toHaveLength(2); // One for addMessage, one for getMessages
      expect(agent.sqlQueries[0].query).toContain('INSERT INTO messages');
      expect(agent.sqlQueries[0].values).toEqual(['New message']);
      expect(result).toEqual([
        { id: 1, text: 'First message' },
        { id: 2, text: 'Second message' }
      ]);
    });

    it('should handle GET request to retrieve messages', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('SELECT * FROM messages');
      expect(result).toEqual([
        { id: 1, text: 'First message' },
        { id: 2, text: 'Second message' }
      ]);
    });

    it('should handle PUT request as GET (fallback)', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'PUT'
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([
        { id: 1, text: 'First message' },
        { id: 2, text: 'Second message' }
      ]);
    });

    it('should handle POST request with missing text field', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing or invalid "text" field');
    });

    it('should handle malformed JSON in POST request', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid JSON in request body');
    });
  });
});