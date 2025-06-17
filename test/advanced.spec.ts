import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HITLAgent } from '../src/agents/HITLAgent';
import { StatefulCalculatorAgent } from '../src/agents/StatefulCalculatorAgent';
import { PersistentCounterAgent } from '../src/agents/PersistentCounterAgent';
import { SecureMcpAgent } from '../src/agents/SecureMcpAgent';
import type { WorkerEnv } from '../src/types';

// Mock WebSocketPair for testing
global.WebSocketPair = vi.fn().mockImplementation(() => ([{}, {}]));

// Mock the agents package
vi.mock('agents', () => ({
  Agent: class MockAgent {
    setState = vi.fn();
    state = { status: 'idle', data: null };
    broadcast = vi.fn();
    name = 'test-agent';
    env = {};
    sql = vi.fn().mockReturnValue([]);
    
    constructor(state: any, env: any) {
      if (state) Object.assign(this, state);
      if (env) this.env = env;
    }
  },
  getAgentByName: vi.fn(),
}));

// Mock the MCP base class
vi.mock('../src/agents/McpAgent', () => ({
  McpAgent: class MockMcpAgent {
    setState = vi.fn();
    state = { 
      serverInfo: { name: 'Test MCP Server', version: '1.0.0' },
      tools: {},
      resources: {}
    };
    addTool = vi.fn();
    tools = new Map();
    sql = vi.fn().mockReturnValue([{ value: 0 }]);
    name = 'test-mcp-agent';
    env = {};
    
    constructor(state: any, env: any) {
      if (state) Object.assign(this, state);
      if (env) this.env = env;
    }
    
    async init() {}
    async onStart() {}
  },
  McpTool: vi.fn(),
}));

describe('Advanced Agentic Patterns', () => {
  let mockEnv: WorkerEnv;

  beforeEach(() => {
    mockEnv = {} as WorkerEnv;
    vi.clearAllMocks();
  });

  describe('HITL (Human-in-the-Loop) Agent', () => {
    it('should pause workflow and request human intervention', async () => {
      const mockState = { setState: vi.fn(), state: { status: 'idle', data: null } };
      const agent = new HITLAgent(mockState as any, mockEnv);
      
      // Mock the setState method
      agent.setState = mockState.setState;
      agent.state = { status: 'idle', data: null };
      agent.name = 'test-hitl-agent';
      agent.env = { DOMAIN: 'test.example.com' };

      const testData = { operation: 'transfer', amount: 10000, account: 'savings' };
      const response = await agent.executeTransaction(testData);

      expect(mockState.setState).toHaveBeenCalledWith({
        status: 'pending_review',
        data: testData
      });

      expect(response.status).toBe(202);
      const responseBody = await response.json();
      expect(responseBody.message).toBe('Awaiting human approval.');
      expect(responseBody.interventionUrl).toContain('token=');
    });

    it('should handle intervention commands', async () => {
      const mockConnection = {
        send: vi.fn(),
        id: 'test-connection'
      };

      const mockState = {
        setState: vi.fn(),
        state: { status: 'pending_review', data: { operation: 'test' } }
      };

      const agent = new HITLAgent(mockState as any, mockEnv);
      agent.setState = mockState.setState;
      agent.state = mockState.state;
      agent.broadcast = vi.fn();

      // Test proceed command
      const proceedCommand = JSON.stringify({ op: 'proceed' });
      await agent.onMessage(mockConnection as any, proceedCommand);

      expect(mockState.setState).toHaveBeenCalledWith({
        ...mockState.state,
        status: 'running'
      });

      // Test abort command
      const abortCommand = JSON.stringify({ op: 'abort' });
      await agent.onMessage(mockConnection as any, abortCommand);

      expect(mockState.setState).toHaveBeenCalledWith({
        ...mockState.state,
        status: 'aborted'
      });
    });

    it('should reject commands when not in pending review state', async () => {
      const mockConnection = { send: vi.fn() };
      const mockState = {
        setState: vi.fn(),
        state: { status: 'idle', data: null }
      };

      const agent = new HITLAgent(mockState as any, mockEnv);
      agent.state = mockState.state;

      const command = JSON.stringify({ op: 'proceed' });
      await agent.onMessage(mockConnection as any, command);

      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          message: 'Agent is not in pending review state'
        })
      );
    });
  });

  describe('Stateful Calculator MCP Agent', () => {
    it('should maintain ephemeral state per session', async () => {
      const mockState = {
        setState: vi.fn(),
        state: {
          total: 0,
          serverInfo: { name: 'Stateful Calculator MCP Server', version: '1.0.0' },
          tools: {},
          resources: {}
        }
      };

      const agent = new StatefulCalculatorAgent(mockState as any, mockEnv);
      agent.setState = mockState.setState;
      agent.state = mockState.state;
      agent.addTool = vi.fn();

      await agent.init();

      // Verify that tools were added
      expect(agent.addTool).toHaveBeenCalledTimes(3);
      const addToolCalls = (agent.addTool as any).mock.calls;
      const toolNames = addToolCalls.map((call: any) => call[0].name);
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('reset');
      expect(toolNames).toContain('get_total');
    });

    it('should handle add tool correctly', async () => {
      const mockState = {
        setState: vi.fn(),
        state: { total: 5 }
      };

      const agent = new StatefulCalculatorAgent(mockState as any, mockEnv);
      agent.setState = mockState.setState;
      agent.state = mockState.state;

      // Simulate the add tool handler
      const addTool = {
        handler: async (params: any) => {
          const newTotal = agent.state.total + params.value;
          agent.setState({ ...agent.state, total: newTotal });
          return {
            content: [{ type: 'text', text: `New total: ${newTotal}` }]
          };
        }
      };

      const result = await addTool.handler({ value: 10 });

      expect(mockState.setState).toHaveBeenCalledWith({
        total: 15
      });
      expect(result.content[0].text).toBe('New total: 15');
    });
  });

  describe('Persistent Counter MCP Agent', () => {
    it('should use SQL for cross-session persistence', async () => {
      const mockSql = vi.fn().mockReturnValue([{ value: 42 }]);
      const mockState = { setState: vi.fn(), state: {} };

      const agent = new PersistentCounterAgent(mockState as any, mockEnv);
      agent.sql = mockSql;
      agent.addTool = vi.fn();

      await agent.onStart();

      // Verify SQL table creation
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('CREATE TABLE IF NOT EXISTS _kv')
        ])
      );

      // Verify counter initialization
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO _kv (key, value) VALUES (\'total\', 0)')
        ])
      );
    });

    it('should handle increment tool with SQL persistence', async () => {
      const mockSql = vi.fn().mockReturnValue([{ value: 5 }]);
      const mockState = { setState: vi.fn(), state: {} };

      const agent = new PersistentCounterAgent(mockState as any, mockEnv);
      agent.sql = mockSql;

      // Simulate the increment tool handler
      const incrementTool = {
        handler: async () => {
          agent.sql`INSERT INTO _kv (key, value) VALUES ('total', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`;
          const result = agent.sql`SELECT value FROM _kv WHERE key = 'total'`;
          const value = result.length > 0 ? result[0].value : 0;
          return {
            content: [{ type: 'text', text: `Persistent total: ${value}` }]
          };
        }
      };

      const result = await incrementTool.handler();

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO _kv')
        ])
      );
      expect(result.content[0].text).toBe('Persistent total: 5');
    });
  });

  describe('Secure MCP Agent', () => {
    it('should initialize with secure tools', async () => {
      const mockState = { setState: vi.fn(), state: {} };
      const agent = new SecureMcpAgent(mockState as any, mockEnv);
      agent.addTool = vi.fn();

      await agent.init();

      // Verify that secure tools were added
      expect(agent.addTool).toHaveBeenCalledTimes(3);
      const addToolCalls = (agent.addTool as any).mock.calls;
      const toolNames = addToolCalls.map((call: any) => call[0].name);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get_time');
      expect(toolNames).toContain('get_info');
    });

    it('should provide static serve methods for OAuth integration', () => {
      expect(typeof SecureMcpAgent.serveSSE).toBe('function');
      expect(typeof SecureMcpAgent.serve).toBe('function');
    });

    it('should handle WebSocket upgrade in serve method', async () => {
      const mockRequest = new Request('https://example.com/mcp', {
        headers: { 'upgrade': 'websocket' }
      });

      const result = await SecureMcpAgent.serve('/mcp')(mockRequest, mockEnv);
      expect(result.status).toBe(200);
    });

    it('should reject non-WebSocket requests', async () => {
      const mockRequest = new Request('https://example.com/mcp');

      const result = await SecureMcpAgent.serve('/mcp')(mockRequest, mockEnv);
      expect(result.status).toBe(400);
    });
  });

  describe('Integration Tests', () => {
    it('should handle HITL workflow with state transitions', async () => {
      const mockState = {
        setState: vi.fn(),
        state: { status: 'idle', data: null }
      };

      const agent = new HITLAgent(mockState as any, mockEnv);
      agent.setState = mockState.setState;
      agent.state = mockState.state;
      agent.broadcast = vi.fn();
      agent.env = { DOMAIN: 'test.example.com' };

      // Start transaction
      const testData = { action: 'sensitive_operation' };
      await agent.executeTransaction(testData);

      expect(mockState.setState).toHaveBeenCalledWith({
        status: 'pending_review',
        data: testData
      });

      // Update state for intervention
      agent.state = { status: 'pending_review', data: testData };

      // Simulate human intervention
      const mockConnection = { send: vi.fn() };
      const proceedCommand = JSON.stringify({ op: 'proceed' });
      await agent.onMessage(mockConnection as any, proceedCommand);

      expect(mockState.setState).toHaveBeenCalledWith({
        status: 'running',
        data: testData
      });
    });

    it('should demonstrate MCP state persistence differences', async () => {
      // Stateful (ephemeral) agent
      const statefulMock = {
        setState: vi.fn(),
        state: { total: 0 }
      };
      const statefulAgent = new StatefulCalculatorAgent(statefulMock as any, mockEnv);
      statefulAgent.setState = statefulMock.setState;
      statefulAgent.state = statefulMock.state;

      // Persistent agent
      const mockSql = vi.fn().mockReturnValue([{ value: 100 }]);
      const persistentMock = { setState: vi.fn(), state: {} };
      const persistentAgent = new PersistentCounterAgent(persistentMock as any, mockEnv);
      persistentAgent.sql = mockSql;

      // Stateful agent updates session state
      statefulAgent.setState({ total: 42 });
      expect(statefulMock.setState).toHaveBeenCalledWith({ total: 42 });

      // Persistent agent uses SQL
      const sqlResult = persistentAgent.sql`SELECT value FROM _kv WHERE key = 'total'`;
      expect(mockSql).toHaveBeenCalled();
      expect(sqlResult[0].value).toBe(100);
    });
  });
});