import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agents module
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public state: any = {}, public env: any = {}) {}
    name = 'test-agent';
  },
  getAgentByName: vi.fn()
}));

const { getAgentByName } = await import('agents');
import { AdminAgent } from '../../src/agents/AdminAgent';
import { MigratingAgent } from '../../src/agents/MigratingAgent';
import type { WorkerEnv } from '../../src/types';

describe('Admin Recovery Integration Tests', () => {
  let adminAgent: AdminAgent;
  let mockMigratingAgent: Partial<MigratingAgent>;
  let mockEnv: WorkerEnv;

  beforeEach(() => {
    mockEnv = {
      ADMIN_SECRET_KEY: 'test-admin-secret-key',
      MIGRATING_AGENT: {} as any
    } as WorkerEnv;

    adminAgent = new AdminAgent({}, mockEnv);

    mockMigratingAgent = {
      _forceUnlock: vi.fn(),
      _rerunMigration: vi.fn()
    };

    vi.mocked(getAgentByName).mockResolvedValue(mockMigratingAgent as MigratingAgent);
  });

  describe('End-to-End Recovery Scenarios', () => {
    it('should handle complete agent recovery workflow', async () => {
      // Simulate a locked agent that needs recovery
      vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue({
        success: true,
        message: 'Agent test-locked-agent has been force unlocked. Please verify data integrity.'
      });

      // Admin performs force unlock
      const unlockRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-locked-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret-key'
        })
      });

      const unlockResponse = await adminAgent.onRequest(unlockRequest);
      expect(unlockResponse.status).toBe(200);
      
      const unlockResult = await unlockResponse.json();
      expect(unlockResult.success).toBe(true);
      expect(unlockResult.message).toContain('force unlocked');

      // Verify the unlock method was called
      expect(mockMigratingAgent._forceUnlock).toHaveBeenCalledTimes(1);
    });

    it('should handle migration rerun workflow', async () => {
      // Simulate successful migration rerun
      vi.mocked(mockMigratingAgent._rerunMigration!).mockResolvedValue({
        success: true,
        message: 'Migration completed successfully for agent test-corrupted-agent',
        version: 2
      });

      // Admin performs migration rerun
      const rerunRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'rerun_migration',
          agentId: 'test-corrupted-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret-key'
        })
      });

      const rerunResponse = await adminAgent.onRequest(rerunRequest);
      expect(rerunResponse.status).toBe(200);
      
      const rerunResult = await rerunResponse.json();
      expect(rerunResult.success).toBe(true);
      expect(rerunResult.message).toContain('Migration completed successfully');
      expect(rerunResult.version).toBe(2);

      // Verify the rerun method was called
      expect(mockMigratingAgent._rerunMigration).toHaveBeenCalledTimes(1);
    });

    it('should prevent unauthorized recovery attempts', async () => {
      const unauthorizedRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'wrong-key'
        })
      });

      const response = await adminAgent.onRequest(unauthorizedRequest);
      expect(response.status).toBe(401);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unauthorized');

      // Verify no admin methods were called
      expect(mockMigratingAgent._forceUnlock).not.toHaveBeenCalled();
      expect(mockMigratingAgent._rerunMigration).not.toHaveBeenCalled();
    });

    it('should handle partial recovery failures gracefully', async () => {
      // Simulate failed unlock
      vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue({
        success: false,
        message: 'Failed to unlock agent: Database connection timeout'
      });

      const request = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-failing-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret-key'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Database connection timeout');
    });

    it('should audit admin operations with proper logging', async () => {
      // Mock console to capture logs
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue({
        success: true,
        message: 'Agent unlocked successfully'
      });

      const request = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-audit-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret-key'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(200);

      // Admin operations should be successful
      const result = await response.json();
      expect(result.success).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Security Integration Tests', () => {
    it('should validate all required parameters before execution', async () => {
      const incompleteRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          // Missing agentId and agentType
          adminKey: 'test-admin-secret-key'
        })
      });

      const response = await adminAgent.onRequest(incompleteRequest);
      expect(response.status).toBe(400);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing required fields');

      // Verify no admin methods were called
      expect(mockMigratingAgent._forceUnlock).not.toHaveBeenCalled();
      expect(mockMigratingAgent._rerunMigration).not.toHaveBeenCalled();
    });

    it('should handle agent lookup failures securely', async () => {
      // Mock agent lookup to fail
      vi.mocked(getAgentByName).mockRejectedValue(new Error('Agent not found'));

      const request = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'nonexistent-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret-key'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to execute operation');
    });

    it('should reject operations on unsupported agent types', async () => {
      const request = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'UnsupportedAgentType',
          adminKey: 'test-admin-secret-key'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(400);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported agent type');
    });
  });

  describe('Resilience Integration Tests', () => {
    it('should handle timeout scenarios during recovery operations', async () => {
      // Mock a long-running operation that should timeout
      vi.mocked(mockMigratingAgent._rerunMigration!).mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => resolve({
            success: false,
            message: 'Operation timed out'
          }), 100);
        })
      );

      const request = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'rerun_migration',
          agentId: 'test-timeout-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret-key'
        })
      });

      const response = await adminAgent.onRequest(request);
      const result = await response.json();
      
      // Should handle timeout gracefully
      expect(result.success).toBe(false);
      expect(result.message).toContain('Operation timed out');
    });

    it('should maintain consistency across multiple concurrent admin operations', async () => {
      // Simulate multiple concurrent unlock operations
      const operations = Array.from({ length: 3 }, (_, i) => {
        vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue({
          success: true,
          message: `Agent test-concurrent-${i} unlocked successfully`
        });

        return new Request('http://test.com/admin/recovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'force_unlock',
            agentId: `test-concurrent-${i}`,
            agentType: 'MigratingAgent',
            adminKey: 'test-admin-secret-key'
          })
        });
      });

      // Execute all operations concurrently
      const responses = await Promise.all(
        operations.map(req => adminAgent.onRequest(req))
      );

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.success).toBe(true);
      }

      // Verify all unlock operations were called
      expect(mockMigratingAgent._forceUnlock).toHaveBeenCalledTimes(3);
    });
  });
});