import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MigratingAgent } from '../../../src/agents/MigratingAgent';
import type { WorkerEnv } from '../../../src/types';

// Mock the agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-migrating-agent';
    public env: any = {};
    public state: any = {};
    public sqlQueries: any[] = [];
    public sqlResults: Record<string, any[]> = {};
    public migrationFailed: boolean = false;
    
    constructor(name?: string) {
      if (name) this.name = name;
    }
    
    sql(strings: TemplateStringsArray, ...values: any[]) {
      const query = strings.join('?');
      this.sqlQueries.push({ query, values });
      
      // Mock responses based on query pattern
      if (query.includes('CREATE TABLE IF NOT EXISTS _meta')) {
        return [];
      }
      if (query.includes('SELECT value FROM _meta WHERE key = \'version\'')) {
        return this.sqlResults['version'] || [];
      }
      if (query.includes('CREATE TABLE users')) {
        return [];
      }
      if (query.includes('ALTER TABLE users ADD COLUMN email')) {
        return [];
      }
      if (query.includes('INSERT INTO _meta') || query.includes('UPDATE _meta')) {
        return [];
      }
      if (query.includes('INSERT INTO users')) {
        return [];
      }
      if (query.includes('SELECT * FROM users ORDER BY id')) {
        return this.sqlResults['users'] || [
          { id: 'user1', name: 'Test User', email: 'test@example.com' }
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

describe('MigratingAgent', () => {
  let agent: MigratingAgent;
  let consoleSpy: any;

  beforeEach(() => {
    agent = new MigratingAgent();
    agent.sqlQueries = [];
    agent.sqlResults = {};
    agent.migrationFailed = false;
    
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('onStart', () => {
    it('should create meta table and run full migration from version 0', async () => {
      await agent.onStart();
      
      expect(agent.sqlQueries).toHaveLength(6);
      
      // Check meta table creation
      expect(agent.sqlQueries[0].query).toContain('CREATE TABLE IF NOT EXISTS _meta');
      
      // Check version query
      expect(agent.sqlQueries[1].query).toContain('SELECT value FROM _meta WHERE key = \'version\'');
      
      // Check v1 migration
      expect(agent.sqlQueries[2].query).toContain('CREATE TABLE users (id TEXT, name TEXT)');
      expect(agent.sqlQueries[3].query).toContain('INSERT INTO _meta (key, value) VALUES (\'version\', 1)');
      
      // Check v2 migration
      expect(agent.sqlQueries[4].query).toContain('ALTER TABLE users ADD COLUMN email TEXT');
      expect(agent.sqlQueries[5].query).toContain('UPDATE _meta SET value = 2 WHERE key = \'version\'');
      
      expect(consoleSpy.log).toHaveBeenCalledWith('Migrating test-migrating-agent from version 0 to 1');
      expect(consoleSpy.log).toHaveBeenCalledWith('Migrating test-migrating-agent from version 1 to 2');
      expect(consoleSpy.log).toHaveBeenCalledWith('Agent test-migrating-agent is at schema version 2');
    });

    it('should only run v2 migration when starting from version 1', async () => {
      agent.sqlResults['version'] = [{ value: 1 }];
      
      await agent.onStart();
      
      expect(agent.sqlQueries).toHaveLength(4);
      expect(agent.sqlQueries[2].query).toContain('ALTER TABLE users ADD COLUMN email TEXT');
      expect(agent.sqlQueries[3].query).toContain('UPDATE _meta SET value = 2 WHERE key = \'version\'');
      expect(consoleSpy.log).toHaveBeenCalledWith('Migrating test-migrating-agent from version 1 to 2');
      expect(consoleSpy.log).not.toHaveBeenCalledWith('Migrating test-migrating-agent from version 0 to 1');
    });

    it('should not run migrations when already at latest version', async () => {
      agent.sqlResults['version'] = [{ value: 2 }];
      
      await agent.onStart();
      
      expect(agent.sqlQueries).toHaveLength(2); // Only meta table creation and version check
      expect(consoleSpy.log).toHaveBeenCalledWith('Agent test-migrating-agent is at schema version 2');
      expect(consoleSpy.log).not.toHaveBeenCalledWith(expect.stringContaining('Migrating'));
    });

    it('should handle migration failure', async () => {
      const mockSql = vi.fn().mockImplementation((strings, ...values) => {
        const query = strings.join('?');
        if (query.includes('CREATE TABLE users')) {
          throw new Error('SQL constraint violation');
        }
        return [];
      });
      
      agent.sql = mockSql;
      
      await agent.onStart();
      
      expect(agent.migrationFailed).toBe(true);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Migration failed for agent test-migrating-agent:',
        expect.any(Error)
      );
    });
  });

  describe('checkMigrationStatus', () => {
    it('should throw error when migration failed', () => {
      agent.migrationFailed = true;
      
      expect(() => agent.checkMigrationStatus()).toThrow(
        'Agent is locked due to migration failure. Manual intervention required.'
      );
    });

    it('should not throw when migration succeeded', () => {
      agent.migrationFailed = false;
      
      expect(() => agent.checkMigrationStatus()).not.toThrow();
    });
  });

  describe('addUser', () => {
    it('should add user successfully', async () => {
      await agent.addUser('user123', 'John Doe', 'john@example.com');
      
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('INSERT INTO users (id, name, email) VALUES (?, ?, ?)');
      expect(agent.sqlQueries[0].values).toEqual(['user123', 'John Doe', 'john@example.com']);
    });

    it('should add user without email', async () => {
      await agent.addUser('user456', 'Jane Doe');
      
      expect(agent.sqlQueries[0].values).toEqual(['user456', 'Jane Doe', null]);
    });

    it('should throw error when migration failed', async () => {
      agent.migrationFailed = true;
      
      await expect(agent.addUser('user789', 'Bob Smith')).rejects.toThrow(
        'Agent is locked due to migration failure'
      );
    });
  });

  describe('getUsers', () => {
    it('should return users successfully', async () => {
      const users = await agent.getUsers();
      
      expect(agent.sqlQueries).toHaveLength(1);
      expect(agent.sqlQueries[0].query).toContain('SELECT * FROM users ORDER BY id');
      expect(users).toEqual([
        { id: 'user1', name: 'Test User', email: 'test@example.com' }
      ]);
    });

    it('should throw error when migration failed', async () => {
      agent.migrationFailed = true;
      
      await expect(agent.getUsers()).rejects.toThrow(
        'Agent is locked due to migration failure'
      );
    });
  });

  describe('onRequest', () => {
    it('should handle POST request to add user', async () => {
      const requestBody = { id: 'user123', name: 'John Doe', email: 'john@example.com' };
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(agent.sqlQueries).toHaveLength(2); // One for addUser, one for getUsers
      expect(result).toEqual([
        { id: 'user1', name: 'Test User', email: 'test@example.com' }
      ]);
    });

    it('should return 400 for missing required fields', async () => {
      const requestBody = { name: 'John Doe' }; // Missing id
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing required fields: id and name are required');
    });

    it('should handle GET request to retrieve users', async () => {
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toEqual([
        { id: 'user1', name: 'Test User', email: 'test@example.com' }
      ]);
    });

    it('should return 503 when migration failed', async () => {
      agent.migrationFailed = true;
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('Agent unavailable due to migration failure');
    });

    it('should return 500 for other errors', async () => {
      const mockCheckMigrationStatus = vi.fn().mockImplementation(() => {
        throw new Error('Some other error');
      });
      agent.checkMigrationStatus = mockCheckMigrationStatus;
      
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(request);
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal server error');
    });

    it('should handle malformed JSON in POST request', async () => {
      const request = new Request('http://example.com/agent/migrating-agent/test-id', {
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