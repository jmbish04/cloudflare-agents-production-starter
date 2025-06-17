import { Agent, Connection } from 'agents';
import type { WorkerEnv } from '../types';

interface McpState {
  serverInfo: {
    name: string;
    version: string;
  };
  tools: Record<string, any>;
  resources: Record<string, any>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (params: any) => Promise<any>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export abstract class McpAgent extends Agent<WorkerEnv, McpState> {
  protected tools: Map<string, McpTool> = new Map();
  protected resources: Map<string, McpResource> = new Map();

  constructor(state: DurableObjectState, env: WorkerEnv) {
    super(state, env);
    this.setState({
      serverInfo: {
        name: 'MCP Server',
        version: '1.0.0'
      },
      tools: {},
      resources: {}
    });
  }

  async onStart() {
    await this.init();
  }

  protected abstract init(): Promise<void>;

  protected addTool(tool: McpTool) {
    this.tools.set(tool.name, tool);
    this.setState({
      ...this.state,
      tools: {
        ...this.state.tools,
        [tool.name]: {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }
      }
    });
  }

  protected addResource(resource: McpResource) {
    this.resources.set(resource.uri, resource);
    this.setState({
      ...this.state,
      resources: {
        ...this.state.resources,
        [resource.uri]: resource
      }
    });
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const request = JSON.parse(message);
      
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(connection, request);
        case 'tools/list':
          return this.handleToolsList(connection, request);
        case 'tools/call':
          return this.handleToolCall(connection, request);
        case 'resources/list':
          return this.handleResourcesList(connection, request);
        case 'resources/read':
          return this.handleResourceRead(connection, request);
        default:
          connection.send(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          }));
      }
    } catch (error) {
      connection.send(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error'
        }
      }));
    }
  }

  private handleInitialize(connection: Connection, request: any) {
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: this.state.serverInfo
      }
    };
    
    connection.send(JSON.stringify(response));
  }

  private handleToolsList(connection: Connection, request: any) {
    const toolsList = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: toolsList
      }
    };
    
    connection.send(JSON.stringify(response));
  }

  private async handleToolCall(connection: Connection, request: any) {
    try {
      const { name, arguments: args } = request.params;
      const tool = this.tools.get(name);
      
      if (!tool) {
        connection.send(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Tool '${name}' not found`
          }
        }));
        return;
      }

      const result = await tool.handler(args);
      
      connection.send(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result)
            }
          ]
        }
      }));
    } catch (error) {
      connection.send(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      }));
    }
  }

  private handleResourcesList(connection: Connection, request: any) {
    const resourcesList = Array.from(this.resources.values());

    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: resourcesList
      }
    };
    
    connection.send(JSON.stringify(response));
  }

  private async handleResourceRead(connection: Connection, request: any) {
    try {
      const { uri } = request.params;
      const resource = this.resources.get(uri);
      
      if (!resource) {
        connection.send(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Resource '${uri}' not found`
          }
        }));
        return;
      }

      const content = await this.readResource(uri);
      
      connection.send(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          contents: [
            {
              uri,
              mimeType: resource.mimeType || 'text/plain',
              text: content
            }
          ]
        }
      }));
    } catch (error) {
      connection.send(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      }));
    }
  }

  protected abstract readResource(uri: string): Promise<string>;
}