import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerEnv } from '../../src/types';

// Mock the agents module for e2e tests
vi.mock('agents', () => {
  // Mock SQL results and state persistence for e2e flows
  const persistentStore: Record<string, any> = {};
  
  class E2EAgent {
    public name: string;
    public env: any = {};
    public state: any = { counter: 0 };
    public sqlQueries: any[] = [];
    
    constructor(name?: string) {
      this.name = name || 'e2e-agent';
      // Load any persistent state
      if (persistentStore[this.name]) {
        this.state = persistentStore[this.name];
      }
    }
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
      persistentStore[this.name] = this.state;
    }
    
    sql(strings: TemplateStringsArray, ...values: any[]) {
      const query = strings.join('?');
      this.sqlQueries.push({ query, values });
      
      // Mock SQL behaviors for complete flows
      if (query.includes('CREATE TABLE')) return [];
      if (query.includes('INSERT INTO messages') && query.includes('RETURNING id')) {
        const key = `${this.name}:messages`;
        if (!persistentStore[key]) persistentStore[key] = [];
        const newId = persistentStore[key].length + 1;
        persistentStore[key].push({ id: newId, text: values[0] });
        return [{ id: newId }];
      }
      if (query.includes('SELECT * FROM messages')) {
        return persistentStore[`${this.name}:messages`] || [];
      }
      if (query.includes('INSERT INTO users')) {
        const key = `${this.name}:users`;
        if (!persistentStore[key]) persistentStore[key] = [];
        persistentStore[key].push({ id: values[0], name: values[1], email: values[2] });
        return [];
      }
      if (query.includes('SELECT * FROM users')) {
        return persistentStore[`${this.name}:users`] || [];
      }
      return [];
    }
    
    async onRequest(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      
      try {
        // History Agent flow
        if (pathParts.includes('history-agent')) {
          if (request.method === 'POST') {
            const body = await request.json() as { text: string };
            if (!body.text) {
              return new Response('Missing text field', { status: 400 });
            }
            const result = this.sql`INSERT INTO messages (text) VALUES (${body.text}) RETURNING id`;
            return Response.json({ id: result[0].id, text: body.text });
          }
          const messages = this.sql`SELECT * FROM messages ORDER BY id ASC`;
          return Response.json(messages);
        }
        
        // Counter Agent flow
        if (pathParts.includes('counter-agent')) {
          const action = pathParts[pathParts.length - 1];
          if (request.method === 'POST' && action === 'increment') {
            this.setState({ counter: this.state.counter + 1 });
            return Response.json(this.state);
          }
          return Response.json(this.state);
        }
        
        // Migrating Agent flow
        if (pathParts.includes('migrating-agent')) {
          // Simulate migration
          this.sql`CREATE TABLE users (id TEXT, name TEXT, email TEXT)`;
          
          if (request.method === 'POST') {
            const body = await request.json() as { id: string; name: string; email?: string };
            if (!body.id || !body.name) {
              return new Response('Missing required fields', { status: 400 });
            }
            this.sql`INSERT INTO users (id, name, email) VALUES (${body.id}, ${body.name}, ${body.email || null})`;
          }
          const users = this.sql`SELECT * FROM users ORDER BY id`;
          return Response.json(users);
        }
        
        return new Response('E2E endpoint handled', { status: 200 });
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

// Import mocked functions
import { getAgentByName } from 'agents';
const mockedGetAgentByName = vi.mocked(getAgentByName);

describe('E2E Complete Flows', () => {
  let env: WorkerEnv;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = {
      MY_AGENT: {} as any,
      SUPERVISOR: {} as any,
      WORKER: {} as any,
      HISTORY_AGENT: {} as any,
      COUNTER_AGENT: {} as any,
      MIGRATING_AGENT: {} as any,
    };
    
    ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as any;
  });

  describe('History Agent Complete Flow', () => {
    it('should handle complete message lifecycle', async () => {
      const testRunId = `e2e-history-${Date.now()}`;
      const agent = await mockedGetAgentByName(env.HISTORY_AGENT, testRunId);
      
      // Step 1: Add first message
      const addMessage1 = new Request(`http://example.com/agent/history-agent/${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'First e2e message' })
      });
      
      const response1 = await agent.onRequest(addMessage1);
      expect(response1.status).toBe(200);
      const result1 = await response1.json();
      expect(result1.id).toBe(1);
      expect(result1.text).toBe('First e2e message');
      
      // Step 2: Add second message
      const addMessage2 = new Request(`http://example.com/agent/history-agent/${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Second e2e message' })
      });
      
      const response2 = await agent.onRequest(addMessage2);
      expect(response2.status).toBe(200);
      const result2 = await response2.json();
      expect(result2.id).toBe(2);
      
      // Step 3: Retrieve all messages
      const getMessages = new Request(`http://example.com/agent/history-agent/${testRunId}`);
      const response3 = await agent.onRequest(getMessages);
      expect(response3.status).toBe(200);
      const messages = await response3.json();
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('First e2e message');
      expect(messages[1].text).toBe('Second e2e message');
    });
  });

  describe('Counter Agent Complete Flow', () => {
    it('should handle complete counter lifecycle', async () => {
      const testRunId = `e2e-counter-${Date.now()}`;
      const agent = await mockedGetAgentByName(env.COUNTER_AGENT, testRunId);
      
      // Step 1: Get initial state
      const getInitial = new Request(`http://example.com/agent/counter-agent/${testRunId}`);
      const response1 = await agent.onRequest(getInitial);
      expect(response1.status).toBe(200);
      const state1 = await response1.json();
      expect(state1.counter).toBe(0);
      
      // Step 2: Increment counter multiple times
      for (let i = 1; i <= 3; i++) {
        const increment = new Request(`http://example.com/agent/counter-agent/${testRunId}/increment`, {
          method: 'POST'
        });
        const response = await agent.onRequest(increment);
        expect(response.status).toBe(200);
        const state = await response.json();
        expect(state.counter).toBe(i);
      }
      
      // Step 3: Verify final state
      const getFinal = new Request(`http://example.com/agent/counter-agent/${testRunId}`);
      const response2 = await agent.onRequest(getFinal);
      expect(response2.status).toBe(200);
      const finalState = await response2.json();
      expect(finalState.counter).toBe(3);
    });
  });

  describe('Migrating Agent Complete Flow', () => {
    it('should handle complete user management lifecycle', async () => {
      const testRunId = `e2e-migrating-${Date.now()}`;
      const agent = await mockedGetAgentByName(env.MIGRATING_AGENT, testRunId);
      
      // Step 1: Initialize (triggers migration)
      const getInitial = new Request(`http://example.com/agent/migrating-agent/${testRunId}`);
      const response1 = await agent.onRequest(getInitial);
      expect(response1.status).toBe(200);
      const initialUsers = await response1.json();
      expect(initialUsers).toEqual([]);
      
      // Step 2: Add users
      const addUser1 = new Request(`http://example.com/agent/migrating-agent/${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'user1', name: 'Alice Smith', email: 'alice@example.com' })
      });
      
      const response2 = await agent.onRequest(addUser1);
      expect(response2.status).toBe(200);
      const users1 = await response2.json();
      expect(users1).toHaveLength(1);
      expect(users1[0].name).toBe('Alice Smith');
      
      const addUser2 = new Request(`http://example.com/agent/migrating-agent/${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'user2', name: 'Bob Johnson' })
      });
      
      const response3 = await agent.onRequest(addUser2);
      expect(response3.status).toBe(200);
      const users2 = await response3.json();
      expect(users2).toHaveLength(2);
      
      // Step 3: Verify final user list
      const getFinal = new Request(`http://example.com/agent/migrating-agent/${testRunId}`);
      const response4 = await agent.onRequest(getFinal);
      expect(response4.status).toBe(200);
      const finalUsers = await response4.json();
      expect(finalUsers).toHaveLength(2);
      expect(finalUsers.map((u: any) => u.name)).toEqual(['Alice Smith', 'Bob Johnson']);
    });
  });

  describe('Cross-Agent E2E Flow', () => {
    it('should maintain isolation between different agent types', async () => {
      const testRunId = `cross-agent-${Date.now()}`;
      
      // Get different agent instances
      const historyAgent = await mockedGetAgentByName(env.HISTORY_AGENT, `history-${testRunId}`);
      const counterAgent = await mockedGetAgentByName(env.COUNTER_AGENT, `counter-${testRunId}`);
      const migratingAgent = await mockedGetAgentByName(env.MIGRATING_AGENT, `migrating-${testRunId}`);
      
      // Operate on each agent
      await historyAgent.onRequest(new Request(`http://example.com/agent/history-agent/history-${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Cross-agent test' })
      }));
      
      await counterAgent.onRequest(new Request(`http://example.com/agent/counter-agent/counter-${testRunId}/increment`, {
        method: 'POST'
      }));
      
      await migratingAgent.onRequest(new Request(`http://example.com/agent/migrating-agent/migrating-${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test-user', name: 'Test User' })
      }));
      
      // Verify each agent's state is independent
      const historyResponse = await historyAgent.onRequest(new Request(`http://example.com/agent/history-agent/history-${testRunId}`));
      const historyData = await historyResponse.json();
      expect(historyData).toHaveLength(1);
      expect(historyData[0].text).toBe('Cross-agent test');
      
      const counterResponse = await counterAgent.onRequest(new Request(`http://example.com/agent/counter-agent/counter-${testRunId}`));
      const counterData = await counterResponse.json();
      expect(counterData.counter).toBe(1);
      
      const migratingResponse = await migratingAgent.onRequest(new Request(`http://example.com/agent/migrating-agent/migrating-${testRunId}`));
      const migratingData = await migratingResponse.json();
      expect(migratingData).toHaveLength(1);
      expect(migratingData[0].name).toBe('Test User');
    });
  });

  describe('Error Handling E2E', () => {
    it('should handle validation errors throughout the flow', async () => {
      const testRunId = `error-handling-${Date.now()}`;
      
      // Test history agent validation
      const historyAgent = await mockedGetAgentByName(env.HISTORY_AGENT, `history-${testRunId}`);
      const invalidHistoryRequest = new Request(`http://example.com/agent/history-agent/history-${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Missing text field
      });
      
      const historyResponse = await historyAgent.onRequest(invalidHistoryRequest);
      expect(historyResponse.status).toBe(400);
      
      // Test migrating agent validation
      const migratingAgent = await mockedGetAgentByName(env.MIGRATING_AGENT, `migrating-${testRunId}`);
      const invalidMigratingRequest = new Request(`http://example.com/agent/migrating-agent/migrating-${testRunId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Only Name' }) // Missing id field
      });
      
      const migratingResponse = await migratingAgent.onRequest(invalidMigratingRequest);
      expect(migratingResponse.status).toBe(400);
    });
  });

  describe('Performance E2E', () => {
    it('should handle multiple concurrent operations', async () => {
      const testRunId = `performance-${Date.now()}`;
      const promises: Promise<Response>[] = [];
      
      // Create multiple counter agents and increment them concurrently
      for (let i = 0; i < 5; i++) {
        const agent = await mockedGetAgentByName(env.COUNTER_AGENT, `perf-counter-${i}-${testRunId}`);
        promises.push(
          agent.onRequest(new Request(`http://example.com/agent/counter-agent/perf-counter-${i}-${testRunId}/increment`, {
            method: 'POST'
          }))
        );
      }
      
      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.counter).toBe(1);
      }
    });
  });
});