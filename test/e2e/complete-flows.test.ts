import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/index';
import type { WorkerEnv } from '../../src/types';

// Mock the agents module for e2e tests
vi.mock('agents', () => {
  // Mock SQL results storage and agent state persistence
  const sqlResults: Record<string, any[]> = {};
  const agentStates: Record<string, any> = {};
  
  class E2EAgent {
    public name: string;
    public env: any = {};
    public state: any = { counter: 0 };
    public sqlQueries: any[] = [];
    public migrationFailed = false;
    
    constructor(name?: string) {
      this.name = name || 'e2e-agent';
      // Load persisted state
      if (agentStates[this.name]) {
        this.state = agentStates[this.name];
      }
    }
    
    sql(strings: TemplateStringsArray, ...values: any[]) {
      const query = strings.join('?');
      this.sqlQueries.push({ query, values });
      
      const key = `${this.name}:${query.split(' ')[0]}`;
      
      // Mock SQL behaviors
      if (query.includes('CREATE TABLE')) {
        return [];
      }
      if (query.includes('SELECT value FROM _meta WHERE key = \'version\'')) {
        return sqlResults[`${this.name}:version`] || [];
      }
      if (query.includes('INSERT INTO messages') && query.includes('RETURNING id')) {
        const messages = sqlResults[`${this.name}:messages`] || [];
        const newId = messages.length + 1;
        messages.push({ id: newId, text: values[0] });
        sqlResults[`${this.name}:messages`] = messages;
        return [{ id: newId }];
      }
      if (query.includes('SELECT * FROM messages ORDER BY id ASC')) {
        return sqlResults[`${this.name}:messages`] || [];
      }
      if (query.includes('INSERT INTO users')) {
        const users = sqlResults[`${this.name}:users`] || [];
        users.push({ id: values[0], name: values[1], email: values[2] });
        sqlResults[`${this.name}:users`] = users;
        return [];
      }
      if (query.includes('SELECT * FROM users ORDER BY id')) {
        return sqlResults[`${this.name}:users`] || [];
      }
      return [];
    }
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
      // Persist state
      agentStates[this.name] = this.state;
    }
    
    async onStart() {
      // Simulate migrations
      await this.sql`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER)`;
      const versionResult = await this.sql`SELECT value FROM _meta WHERE key = 'version'`;
      const version = versionResult.length > 0 ? versionResult[0].value : 0;
      
      if (version < 1) {
        await this.sql`CREATE TABLE users (id TEXT, name TEXT)`;
        await this.sql`INSERT INTO _meta (key, value) VALUES ('version', 1) ON CONFLICT(key) DO UPDATE SET value = 1`;
      }
      if (version < 2) {
        await this.sql`ALTER TABLE users ADD COLUMN email TEXT`;
        await this.sql`UPDATE _meta SET value = 2 WHERE key = 'version'`;
      }
    }
    
    async addMessage(text: string) {
      return await this.sql`INSERT INTO messages (text) VALUES (${text}) RETURNING id`;
    }
    
    async getMessages() {
      return await this.sql`SELECT * FROM messages ORDER BY id ASC`;
    }
    
    async addUser(id: string, name: string, email?: string) {
      if (!this.migrationFailed) {
        await this.sql`INSERT INTO users (id, name, email) VALUES (${id}, ${name}, ${email || null})`;
      } else {
        throw new Error('Agent is locked due to migration failure');
      }
    }
    
    async getUsers() {
      if (this.migrationFailed) {
        throw new Error('Agent is locked due to migration failure');
      }
      return await this.sql`SELECT * FROM users ORDER BY id`;
    }
    
    async increment() {
      this.setState({ counter: this.state.counter + 1 });
    }
    
    async sayHello(name: string) {
      return `Hello, ${name}!`;
    }
    
    async doComplexTask(url: string) {
      return new Response(`Task completed for ${url}`);
    }
    
    async onRequest(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        
        // History Agent simulation
        if (pathParts.includes('history-agent')) {
          if (request.method === 'POST') {
            const body = await request.json() as { text: string };
            if (!body.text) {
              return new Response('Missing text field', { status: 400 });
            }
            await this.addMessage(body.text);
          }
          const messages = await this.getMessages();
          return Response.json(messages);
        }
        
        // Counter Agent simulation
        if (pathParts.includes('counter-agent')) {
          const action = pathParts[pathParts.length - 1];
          if (request.method === 'POST' && action === 'increment') {
            await this.increment();
            return Response.json(this.state);
          }
          if (request.method === 'GET') {
            return Response.json(this.state);
          }
        }
        
        // Migrating Agent simulation
        if (pathParts.includes('migrating-agent')) {
          await this.onStart(); // Ensure migrations are run
          
          if (request.method === 'POST') {
            const body = await request.json() as { id: string; name: string; email?: string };
            if (!body.id || !body.name) {
              return new Response('Missing required fields', { status: 400 });
            }
            await this.addUser(body.id, body.name, body.email);
          }
          const users = await this.getUsers();
          return Response.json(users);
        }
        
        return new Response('Mock agent response');
      } catch (error) {
        console.error('E2E Agent error:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    }
  }
  
  const getAgentByName = vi.fn().mockImplementation(async (binding: any, id: string) => {
    return new E2EAgent(id);
  });
  
  return { Agent: E2EAgent, getAgentByName };
});

describe('End-to-End Complete Flows', () => {
  let env: WorkerEnv;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
      HISTORY_AGENT: {} as any,
      COUNTER_AGENT: {} as any,
      MIGRATING_AGENT: {} as any
    };
    
    ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    } as any;
  });

  describe('Complete user workflow scenarios', () => {
    it('should handle complete message history workflow', async () => {
      const agentId = 'chat-session-123';
      
      // 1. Initial state - no messages
      let request = new Request(`http://example.com/agent/history-agent/${agentId}`, {
        method: 'GET'
      });
      let response = await worker.fetch(request, env, ctx);
      let messages = await response.json();
      
      expect(response.status).toBe(200);
      expect(messages).toEqual([]);
      
      // 2. Add first message
      request = new Request(`http://example.com/agent/history-agent/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello, world!' })
      });
      response = await worker.fetch(request, env, ctx);
      messages = await response.json();
      
      expect(response.status).toBe(200);
      expect(messages).toEqual([{ id: 1, text: 'Hello, world!' }]);
      
      // 3. Add second message
      request = new Request(`http://example.com/agent/history-agent/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'How are you?' })
      });
      response = await worker.fetch(request, env, ctx);
      messages = await response.json();
      
      expect(response.status).toBe(200);
      expect(messages).toEqual([
        { id: 1, text: 'Hello, world!' },
        { id: 2, text: 'How are you?' }
      ]);
      
      // 4. Verify persistence - get messages again
      request = new Request(`http://example.com/agent/history-agent/${agentId}`, {
        method: 'GET'
      });
      response = await worker.fetch(request, env, ctx);
      messages = await response.json();
      
      expect(response.status).toBe(200);
      expect(messages).toEqual([
        { id: 1, text: 'Hello, world!' },
        { id: 2, text: 'How are you?' }
      ]);
    });

    it('should handle complete counter workflow with state persistence', async () => {
      const agentId = 'counter-widget-456';
      
      // 1. Initial state
      let request = new Request(`http://example.com/agent/counter-agent/${agentId}`, {
        method: 'GET'
      });
      let response = await worker.fetch(request, env, ctx);
      let state = await response.json();
      
      expect(response.status).toBe(200);
      expect(state).toEqual({ counter: 0 });
      
      // 2. Increment counter
      request = new Request(`http://example.com/agent/counter-agent/${agentId}/increment`, {
        method: 'POST'
      });
      response = await worker.fetch(request, env, ctx);
      state = await response.json();
      
      expect(response.status).toBe(200);
      expect(state).toEqual({ counter: 1 });
      
      // 3. Increment again
      request = new Request(`http://example.com/agent/counter-agent/${agentId}/increment`, {
        method: 'POST'
      });
      response = await worker.fetch(request, env, ctx);
      state = await response.json();
      
      expect(response.status).toBe(200);
      expect(state).toEqual({ counter: 2 });
      
      // 4. Verify state persistence
      request = new Request(`http://example.com/agent/counter-agent/${agentId}/state`, {
        method: 'GET'
      });
      response = await worker.fetch(request, env, ctx);
      state = await response.json();
      
      expect(response.status).toBe(200);
      expect(state).toEqual({ counter: 2 });
    });

    it('should handle complete user management workflow with migrations', async () => {
      const agentId = 'user-db-789';
      
      // 1. Initial state - should trigger migrations and return empty users
      let request = new Request(`http://example.com/agent/migrating-agent/${agentId}`, {
        method: 'GET'
      });
      let response = await worker.fetch(request, env, ctx);
      let users = await response.json();
      
      expect(response.status).toBe(200);
      expect(users).toEqual([]);
      
      // 2. Add first user
      request = new Request(`http://example.com/agent/migrating-agent/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'user1', name: 'John Doe', email: 'john@example.com' })
      });
      response = await worker.fetch(request, env, ctx);
      users = await response.json();
      
      expect(response.status).toBe(200);
      expect(users).toEqual([{ id: 'user1', name: 'John Doe', email: 'john@example.com' }]);
      
      // 3. Add second user without email
      request = new Request(`http://example.com/agent/migrating-agent/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'user2', name: 'Jane Smith' })
      });
      response = await worker.fetch(request, env, ctx);
      users = await response.json();
      
      expect(response.status).toBe(200);
      expect(users).toEqual([
        { id: 'user1', name: 'John Doe', email: 'john@example.com' },
        { id: 'user2', name: 'Jane Smith', email: null }
      ]);
      
      // 4. Verify data persistence
      request = new Request(`http://example.com/agent/migrating-agent/${agentId}`, {
        method: 'GET'
      });
      response = await worker.fetch(request, env, ctx);
      users = await response.json();
      
      expect(response.status).toBe(200);
      expect(users).toEqual([
        { id: 'user1', name: 'John Doe', email: 'john@example.com' },
        { id: 'user2', name: 'Jane Smith', email: null }
      ]);
    });
  });

  describe('Error scenarios and edge cases', () => {
    it('should handle validation errors gracefully', async () => {
      // History agent - missing text
      let request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      let response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing text field');
      
      // Migrating agent - missing required fields
      request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John Doe' }) // Missing id
      });
      response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing required fields');
    });

    it('should handle unknown routes', async () => {
      const request = new Request('http://example.com/unknown/route', {
        method: 'GET'
      });
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('http://example.com/agent/history-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      const response = await worker.fetch(request, env, ctx);
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
    });
  });

  describe('Cross-agent isolation', () => {
    it('should maintain isolation between different agent instances', async () => {
      // Create two different counter instances
      const counter1 = 'counter-1';
      const counter2 = 'counter-2';
      
      // Increment counter1
      let request = new Request(`http://example.com/agent/counter-agent/${counter1}/increment`, {
        method: 'POST'
      });
      let response = await worker.fetch(request, env, ctx);
      let state = await response.json();
      expect(state).toEqual({ counter: 1 });
      
      // Counter2 should still be at 0
      request = new Request(`http://example.com/agent/counter-agent/${counter2}`, {
        method: 'GET'
      });
      response = await worker.fetch(request, env, ctx);
      state = await response.json();
      expect(state).toEqual({ counter: 0 });
      
      // Different agent types should also be isolated
      request = new Request(`http://example.com/agent/history-agent/${counter1}`, {
        method: 'GET'
      });
      response = await worker.fetch(request, env, ctx);
      const messages = await response.json();
      expect(messages).toEqual([]); // Should be empty, unaffected by counter operations
    });
  });
});