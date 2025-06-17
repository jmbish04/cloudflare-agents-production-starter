import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockAgent } from './test-utils';

// Mock the AI SDK modules
vi.mock('ai', () => ({
  streamText: vi.fn().mockResolvedValue({
    toTextStreamResponse: vi.fn().mockReturnValue(
      new Response("data: test stream\n\n", {
        headers: { "Content-Type": "text/event-stream" }
      })
    )
  })
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue({})
}));

describe('Verification Tests - Automated', () => {
  let EchoAgent: any;
  let StreamingAgent: any;
  let CounterAgent: any;
  let ChattyAgent: any;

  beforeAll(async () => {
    const { EchoAgent: EA } = await import('../src/agents/EchoAgent');
    const { StreamingAgent: SA } = await import('../src/agents/StreamingAgent');
    const { CounterAgent: CA } = await import('../src/agents/CounterAgent');
    const { ChattyAgent: CHA } = await import('../src/agents/ChattyAgent');
    
    EchoAgent = EA;
    StreamingAgent = SA;
    CounterAgent = CA;
    ChattyAgent = CHA;
  });

  describe('EchoAgent WebSocket Lifecycle', () => {
    it('should send Welcome message on connect', async () => {
      const agent = createMockAgent(EchoAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onConnect(connection);
      
      expect(connection.send).toHaveBeenCalledWith('Welcome!');
    });

    it('should echo messages with "You said:" prefix', async () => {
      const agent = createMockAgent(EchoAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, 'test message');
      
      expect(connection.send).toHaveBeenCalledWith('You said: test message');
    });
  });

  describe('StreamingAgent SSE', () => {
    it('should return text/event-stream response', async () => {
      const agent = createMockAgent(StreamingAgent, { OPENAI_API_KEY: 'test-key' });
      const request = new Request('http://example.com/test');
      
      const response = await agent.onRequest(request);
      
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });
  });

  describe('CounterAgent Command Pattern', () => {
    it('should handle increment command', async () => {
      const agent = createMockAgent(CounterAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, JSON.stringify({ op: 'increment' }));
      
      expect(agent.state.counter).toBe(1);
    });

    it('should handle decrement command', async () => {
      const agent = createMockAgent(CounterAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, JSON.stringify({ op: 'decrement' }));
      
      expect(agent.state.counter).toBe(-1);
    });

    it('should handle malformed JSON gracefully', async () => {
      const agent = createMockAgent(CounterAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      // Should not throw
      await expect(agent.onMessage(connection, 'invalid json')).resolves.not.toThrow();
    });
  });

  describe('ChattyAgent Connection State', () => {
    it('should set nickname per connection', async () => {
      const agent = createMockAgent(ChattyAgent);
      const connectionA = { id: 'test-1', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: null };
      const connectionB = { id: 'test-2', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: null };
      
      await agent.onMessage(connectionA, JSON.stringify({ op: 'set_nick', nick: 'Alice' }));
      await agent.onMessage(connectionB, JSON.stringify({ op: 'set_nick', nick: 'Bob' }));
      
      expect(connectionA.setState).toHaveBeenCalledWith({ nickname: 'Alice' });
      expect(connectionB.setState).toHaveBeenCalledWith({ nickname: 'Bob' });
    });

    it('should broadcast messages with nickname prefix', async () => {
      const agent = createMockAgent(ChattyAgent);
      const connectionA = { id: 'test-1', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: { nickname: 'Alice' } };
      const connectionB = { id: 'test-2', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: { nickname: 'Bob' } };
      
      // Add connections to the agent
      agent.connections = [connectionA, connectionB];
      
      await agent.onMessage(connectionA, JSON.stringify({ op: 'send_text', text: 'Hello everyone' }));
      
      expect(connectionA.send).toHaveBeenCalledWith('Alice: Hello everyone');
      expect(connectionB.send).toHaveBeenCalledWith('Alice: Hello everyone');
    });
  });
});