import { vi } from 'vitest';

// Mock SQL interface
export const createMockSql = () => {
  const storage: Record<string, any[]> = {};
  
  return vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join('?');
    
    // Simple mock - return empty array for queries
    if (query.toLowerCase().includes('select')) {
      return [];
    }
    
    // For inserts/updates, just return success
    return { changes: 1, lastInsertRowid: 1 };
  });
};

// Create mock agent with basic functionality
export const createMockAgent = (AgentClass: any, env: any = {}) => {
  const mockSql = createMockSql();
  
  const agent = new AgentClass({} as any, env);
  
  // Mock basic agent properties
  agent.sql = mockSql;
  agent.env = env;
  agent.state = { counter: 0 };
  agent.connections = [];
  
  // Mock setState method
  agent.setState = vi.fn((newState: any) => {
    agent.state = { ...agent.state, ...newState };
  });
  
  // Mock broadcast method for ChattyAgent
  agent.broadcast = vi.fn((message: string) => {
    agent.connections?.forEach((conn: any) => {
      conn.send?.(message);
    });
  });
  
  return agent;
};