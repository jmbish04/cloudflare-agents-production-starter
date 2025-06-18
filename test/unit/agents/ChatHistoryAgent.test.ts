import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatHistoryAgent } from '../../../src/agents/ChatHistoryAgent';
import type { WorkerEnv } from '../../../src/types';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-chat-history-agent';
    public env: any = {};
    public state: any = { lastMessageTimestamp: 0 };
    public sqlQueries: any[] = [];
    public sqlResults: Record<string, any[]> = {};
    public initialState = { lastMessageTimestamp: 0 };
    
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
      if (query.includes('INSERT INTO messages') && query.includes('RETURNING')) {
        const timestamp = new Date().toISOString();
        return [{
          id: this.sqlQueries.length,
          role: values[0],
          content: values[1],
          createdAt: timestamp
        }];
      }
      if (query.includes('SELECT id, role, content, createdAt FROM messages ORDER BY createdAt ASC')) {
        return this.sqlResults['messages'] || [
          { id: 1, role: 'user', content: 'Hello', createdAt: '2024-01-01T12:00:00.000Z' },
          { id: 2, role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01T12:01:00.000Z' }
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

describe('ChatHistoryAgent', () => {
  let agent: ChatHistoryAgent;

  beforeEach(() => {
    agent = new ChatHistoryAgent();
    agent.sqlQueries = [];
    agent.sqlResults = {};
    agent.state = { lastMessageTimestamp: 0 };
  });

  describe('onStart', () => {
    it('should create messages table with proper schema', async () => {
      await agent.onStart();
      
      expect(agent.sqlQueries).toHaveLength(1);
      const query = agent.sqlQueries[0].query;
      expect(query).toContain('CREATE TABLE IF NOT EXISTS messages');
      expect(query).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(query).toContain('role TEXT NOT NULL');
      expect(query).toContain('content TEXT NOT NULL');
      expect(query).toContain('createdAt TEXT NOT NULL');
    });
  });

  describe('addMessage', () => {
    it('should insert user message and update state', async () => {
      const result = await agent.addMessage('user', 'Hello world');
      
      expect(agent.sqlQueries).toHaveLength(1);
      const query = agent.sqlQueries[0];
      expect(query.query).toContain('INSERT INTO messages (role, content, createdAt)');
      expect(query.query).toContain('RETURNING id, role, content, createdAt');
      expect(query.values[0]).toBe('user');
      expect(query.values[1]).toBe('Hello world');
      expect(query.values[2]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      expect(result).toEqual({
        id: 1,
        role: 'user',
        content: 'Hello world',
        createdAt: expect.any(String)
      });
      
      expect(agent.state.lastMessageTimestamp).toBeGreaterThan(0);
    });

    it('should insert assistant message', async () => {
      const result = await agent.addMessage('assistant', 'How can I help you?');
      
      expect(agent.sqlQueries[0].values[0]).toBe('assistant');
      expect(agent.sqlQueries[0].values[1]).toBe('How can I help you?');
      expect(result.role).toBe('assistant');
      expect(result.content).toBe('How can I help you?');
    });

    it('should insert system message', async () => {
      const result = await agent.addMessage('system', 'Welcome to the chat');
      
      expect(agent.sqlQueries[0].values[0]).toBe('system');
      expect(agent.sqlQueries[0].values[1]).toBe('Welcome to the chat');
      expect(result.role).toBe('system');
      expect(result.content).toBe('Welcome to the chat');
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Message with "quotes", \'apostrophes\', & symbols 🚀';
      const result = await agent.addMessage('user', specialContent);
      
      expect(agent.sqlQueries[0].values[1]).toBe(specialContent);
      expect(result.content).toBe(specialContent);
    });

    it('should update state timestamp on each message', async () => {
      const initialTimestamp = agent.state.lastMessageTimestamp;
      
      await agent.addMessage('user', 'First message');
      const firstTimestamp = agent.state.lastMessageTimestamp;
      expect(firstTimestamp).toBeGreaterThan(initialTimestamp);
      
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      
      await agent.addMessage('user', 'Second message');
      const secondTimestamp = agent.state.lastMessageTimestamp;
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
    });
  });

  describe('getHistory', () => {
    it('should return all messages ordered by createdAt', async () => {
      const messages = await agent.getHistory();
      
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('SELECT id, role, content, createdAt FROM messages ORDER BY createdAt ASC');
      expect(messages).toEqual([
        { id: 1, role: 'user', content: 'Hello', createdAt: '2024-01-01T12:00:00.000Z' },
        { id: 2, role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01T12:01:00.000Z' }
      ]);
    });

    it('should return empty array when no messages', async () => {
      agent.sqlResults['messages'] = [];
      const messages = await agent.getHistory();
      
      expect(messages).toEqual([]);
    });
  });

  describe('onRequest', () => {
    describe('POST requests', () => {
      it('should handle valid user message', async () => {
        const requestBody = { role: 'user', content: 'Hello there' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        const result = await response.json();
        
        expect(response.status).toBe(200);
        expect(agent.sqlQueries).toHaveLength(1);
        expect(agent.sqlQueries[0].values).toEqual(['user', 'Hello there', expect.any(String)]);
        expect(result).toEqual({
          id: 1,
          role: 'user',
          content: 'Hello there',
          createdAt: expect.any(String)
        });
      });

      it('should handle valid assistant message', async () => {
        const requestBody = { role: 'assistant', content: 'I can help with that' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(200);
        expect(agent.sqlQueries[0].values[0]).toBe('assistant');
        expect(agent.sqlQueries[0].values[1]).toBe('I can help with that');
      });

      it('should trim whitespace from content', async () => {
        const requestBody = { role: 'user', content: '  Hello with spaces  ' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(200);
        expect(agent.sqlQueries[0].values[1]).toBe('Hello with spaces');
      });

      it('should reject invalid JSON', async () => {
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json'
        });

        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Invalid JSON in request body');
      });

      it('should reject missing role field', async () => {
        const requestBody = { content: 'Message without role' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing or invalid "role" field. Must be "user", "assistant", or "system"');
      });

      it('should reject invalid role value', async () => {
        const requestBody = { role: 'invalid', content: 'Test message' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing or invalid "role" field. Must be "user", "assistant", or "system"');
      });

      it('should reject missing content field', async () => {
        const requestBody = { role: 'user' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing or invalid "content" field');
      });

      it('should reject empty content after trimming', async () => {
        const requestBody = { role: 'user', content: '   ' };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing or invalid "content" field');
      });

      it('should reject content that is too long', async () => {
        const longContent = 'x'.repeat(10001);
        const requestBody = { role: 'user', content: longContent };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Message content too long (max 10000 characters)');
      });

      it('should accept content at max length', async () => {
        const maxContent = 'x'.repeat(10000);
        const requestBody = { role: 'user', content: maxContent };
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(200);
        expect(agent.sqlQueries[0].values[1]).toBe(maxContent);
      });
    });

    describe('GET requests', () => {
      it('should return chat history', async () => {
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'GET'
        });
        
        const response = await agent.onRequest(request);
        const result = await response.json();
        
        expect(response.status).toBe(200);
        expect(agent.sqlQueries).toHaveLength(1);
        expect(agent.sqlQueries[0].query).toContain('SELECT id, role, content, createdAt FROM messages ORDER BY createdAt ASC');
        expect(result).toEqual([
          { id: 1, role: 'user', content: 'Hello', createdAt: '2024-01-01T12:00:00.000Z' },
          { id: 2, role: 'assistant', content: 'Hi there!', createdAt: '2024-01-01T12:01:00.000Z' }
        ]);
      });
    });

    describe('unsupported methods', () => {
      it('should reject PUT requests', async () => {
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'PUT'
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(405);
        expect(await response.text()).toBe('Method not allowed');
      });

      it('should reject DELETE requests', async () => {
        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'DELETE'
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(405);
        expect(await response.text()).toBe('Method not allowed');
      });
    });

    describe('error handling', () => {
      it('should handle SQL errors gracefully', async () => {
        // Mock SQL to throw an error
        agent.sql = vi.fn().mockImplementation(() => {
          throw new Error('Database connection failed');
        });

        const request = new Request('http://example.com/agent/chat-history-agent/test-id', {
          method: 'GET'
        });
        
        const response = await agent.onRequest(request);
        
        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal server error');
      });
    });
  });

  describe('state management', () => {
    it('should have proper initial state', () => {
      expect(agent.initialState).toEqual({ lastMessageTimestamp: 0 });
    });

    it('should update timestamp when adding messages', async () => {
      expect(agent.state.lastMessageTimestamp).toBe(0);
      
      await agent.addMessage('user', 'Test message');
      
      expect(agent.state.lastMessageTimestamp).toBeGreaterThan(0);
      expect(typeof agent.state.lastMessageTimestamp).toBe('number');
    });
  });
});