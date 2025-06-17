import { McpAgent, McpTool } from './McpAgent';
import { Connection } from 'agents';
import type { WorkerEnv } from '../types';

export class PersistentCounterAgent extends McpAgent {
  initialState = {
    serverInfo: {
      name: 'Persistent Counter MCP Server',
      version: '1.0.0'
    },
    tools: {},
    resources: {}
  };

  async onStart(): Promise<void> {
    // Initialize SQL table for persistent storage
    this.sql`CREATE TABLE IF NOT EXISTS _kv (key TEXT PRIMARY KEY, value INTEGER)`;
    
    // Initialize the counter if it doesn't exist
    this.sql`INSERT INTO _kv (key, value) VALUES ('total', 0) ON CONFLICT(key) DO NOTHING`;
    
    // Call parent onStart to initialize tools
    await super.onStart();
  }

  protected async init(): Promise<void> {
    // Define the increment tool
    const incrementTool: McpTool = {
      name: 'increment',
      description: 'Increment the persistent counter that survives across all sessions',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        // Read-modify-write in SQL for cross-session persistence
        this.sql`INSERT INTO _kv (key, value) VALUES ('total', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`;
        
        const result = this.sql`SELECT value FROM _kv WHERE key = 'total'`;
        const value = result.length > 0 ? result[0].value : 0;
        
        return {
          content: [
            {
              type: 'text',
              text: `Persistent total: ${value}`
            }
          ]
        };
      }
    };

    // Define the decrement tool
    const decrementTool: McpTool = {
      name: 'decrement',
      description: 'Decrement the persistent counter',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        this.sql`UPDATE _kv SET value = value - 1 WHERE key = 'total'`;
        
        const result = this.sql`SELECT value FROM _kv WHERE key = 'total'`;
        const value = result.length > 0 ? result[0].value : 0;
        
        return {
          content: [
            {
              type: 'text',
              text: `Persistent total: ${value}`
            }
          ]
        };
      }
    };

    // Define the get_count tool
    const getCountTool: McpTool = {
      name: 'get_count',
      description: 'Get the current persistent counter value',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        const result = this.sql`SELECT value FROM _kv WHERE key = 'total'`;
        const value = result.length > 0 ? result[0].value : 0;
        
        return {
          content: [
            {
              type: 'text',
              text: `Persistent total: ${value}`
            }
          ]
        };
      }
    };

    // Define the reset tool
    const resetTool: McpTool = {
      name: 'reset',
      description: 'Reset the persistent counter to zero',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        this.sql`UPDATE _kv SET value = 0 WHERE key = 'total'`;
        
        return {
          content: [
            {
              type: 'text',
              text: 'Persistent total reset to 0'
            }
          ]
        };
      }
    };

    // Register all tools
    this.addTool(incrementTool);
    this.addTool(decrementTool);
    this.addTool(getCountTool);
    this.addTool(resetTool);
  }

  protected async readResource(uri: string): Promise<string> {
    // This counter doesn't have resources, but we need to implement the abstract method
    throw new Error(`Resource not found: ${uri}`);
  }

  async onConnect(connection: Connection): Promise<void> {
    // Get current count and send welcome message
    const result = this.sql`SELECT value FROM _kv WHERE key = 'total'`;
    const currentValue = result.length > 0 ? result[0].value : 0;
    
    connection.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {
        message: `Welcome to Persistent Counter! Current value: ${currentValue}`
      }
    }));
  }
}