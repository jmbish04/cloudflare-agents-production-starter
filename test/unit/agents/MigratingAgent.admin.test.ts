import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agents module before importing MigratingAgent
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public state: any = {}, public env: any = {}) {}
    name = 'test-agent';
  }
}));

// Import after mocking
import { MigratingAgent } from '../../../src/agents/MigratingAgent';
import type { WorkerEnv } from '../../../src/types';

describe('MigratingAgent Admin Methods', () => {
  let agent: MigratingAgent;
  let mockSqlResults: any[];

  beforeEach(() => {
    mockSqlResults = [];
    
    const mockSql = vi.fn().mockImplementation((query) => {
      if (query.toString().includes('SELECT value FROM _meta WHERE key = \'migration_status\'')) {
        return mockSqlResults;
      }
      if (query.toString().includes('SELECT value FROM _meta WHERE key = \'version\'')) {
        return [{ value: 2 }]; // Latest version
      }
      return [];
    });

    agent = new MigratingAgent({}, {} as WorkerEnv);
    // @ts-ignore - Override sql for testing
    agent.sql = mockSql;
    // @ts-ignore - Set agent name for testing
    agent.name = 'test-migrating-agent';
  });

  describe('_forceUnlock', () => {
    it('should successfully unlock a locked agent', async () => {
      const result = await agent._forceUnlock();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('test-migrating-agent has been force unlocked');
      expect(result.message).toContain('Please verify data integrity');
    });

    it('should handle SQL errors during unlock', async () => {
      // @ts-ignore - Mock SQL to throw error
      agent.sql = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      
      const result = await agent._forceUnlock();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to unlock agent');
      expect(result.message).toContain('Database connection failed');
    });

    it('should handle unknown errors during unlock', async () => {
      // @ts-ignore - Mock SQL to throw non-Error
      agent.sql = vi.fn().mockRejectedValue('Unexpected error');
      
      const result = await agent._forceUnlock();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to unlock agent');
      expect(result.message).toContain('Unknown error');
    });
  });

  describe('_rerunMigration', () => {
    it('should successfully rerun migration', async () => {
      // Mock onStart to succeed
      vi.spyOn(agent, 'onStart').mockResolvedValue();
      
      const result = await agent._rerunMigration();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Migration completed successfully');
      expect(result.message).toContain('test-migrating-agent');
      expect(result.version).toBe(2);
    });

    it('should handle migration failure and mark as failed', async () => {
      // Mock onStart to fail
      vi.spyOn(agent, 'onStart').mockRejectedValue(new Error('Migration step failed'));
      
      const result = await agent._rerunMigration();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Migration rerun failed');
      expect(result.message).toContain('Migration step failed');
    });

    it('should handle unknown errors during migration rerun', async () => {
      // Mock onStart to throw non-Error
      vi.spyOn(agent, 'onStart').mockRejectedValue('Unexpected failure');
      
      const result = await agent._rerunMigration();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Migration rerun failed');
      expect(result.message).toContain('Unknown error');
    });

    it('should reset version and status before rerunning', async () => {
      const mockSql = vi.fn().mockImplementation((query) => {
        if (query.toString().includes('SELECT value FROM _meta WHERE key = \'version\'')) {
          return [{ value: 0 }]; // Reset version
        }
        return [];
      });
      
      // @ts-ignore
      agent.sql = mockSql;
      vi.spyOn(agent, 'onStart').mockResolvedValue();
      
      const result = await agent._rerunMigration();
      
      expect(result.success).toBe(true);
      expect(mockSql).toHaveBeenCalledWith(expect.arrayContaining([
        expect.stringContaining('UPDATE _meta SET value = \'ok\' WHERE key = \'migration_status\'')
      ]));
      expect(mockSql).toHaveBeenCalledWith(expect.arrayContaining([
        expect.stringContaining('DROP TABLE IF EXISTS users')
      ]));
      expect(mockSql).toHaveBeenCalledWith(expect.arrayContaining([
        expect.stringContaining('UPDATE _meta SET value = 0 WHERE key = \'version\'')
      ]));
    });

    it('should handle SQL failures during reset phase', async () => {
      let callCount = 0;
      const mockSql = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call (status reset) fails
          throw new Error('SQL update failed');
        }
        return [];
      });
      
      // @ts-ignore
      agent.sql = mockSql;
      
      const result = await agent._rerunMigration();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Migration rerun failed');
      expect(result.message).toContain('SQL update failed');
    });
  });

  describe('Integration with existing methods', () => {
    it('should allow operations after successful force unlock', async () => {
      // Simulate locked state
      mockSqlResults = [{ value: 'failed' }];
      
      // First verify agent is locked
      await expect(agent.getUsers()).rejects.toThrow();
      
      // Force unlock
      await agent._forceUnlock();
      
      // Update mock to return 'ok' status
      mockSqlResults = [{ value: 'ok' }];
      
      // Now operations should work
      const users = await agent.getUsers();
      expect(Array.isArray(users)).toBe(true);
    });

    it('should restore functionality after successful migration rerun', async () => {
      // Simulate failed state
      mockSqlResults = [{ value: 'failed' }];
      
      // Mock onStart to succeed and update status
      vi.spyOn(agent, 'onStart').mockImplementation(async () => {
        mockSqlResults = [{ value: 'ok' }]; // Simulate successful migration
      });
      
      const result = await agent._rerunMigration();
      
      expect(result.success).toBe(true);
      
      // Now operations should work
      const users = await agent.getUsers();
      expect(Array.isArray(users)).toBe(true);
    });
  });
});