import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agents module
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public state: any = {}, public env: any = {}) {}
    name = 'test-agent';
    sql = vi.fn();
    schedule = vi.fn();
  },
  getAgentByName: vi.fn()
}));

const { getAgentByName } = await import('agents');
import { MigratingAgent } from '../../src/agents/MigratingAgent';
import { ReminderAgent } from '../../src/agents/ReminderAgent';
import { AdminAgent } from '../../src/agents/AdminAgent';
import type { WorkerEnv } from '../../src/types';

describe('Resilience Patterns E2E Tests', () => {
  let mockEnv: WorkerEnv;

  beforeEach(() => {
    mockEnv = {
      ADMIN_SECRET_KEY: 'e2e-admin-secret',
      MIGRATING_AGENT: {} as any,
      REMINDER_AGENT: {} as any,
      ADMIN_AGENT: {} as any
    } as WorkerEnv;
  });

  describe('Migration Failure Recovery E2E', () => {
    it('should handle complete migration failure and recovery cycle', async () => {
      // Step 1: Create a MigratingAgent that will fail during startup
      const migratingAgent = new MigratingAgent({}, mockEnv);
      
      // Mock SQL to fail during migration
      let migrationAttempts = 0;
      const mockSql = vi.fn().mockImplementation((query) => {
        migrationAttempts++;
        if (migrationAttempts <= 3) {
          // First 3 attempts fail
          throw new Error('Database corruption detected');
        }
        // Subsequent attempts succeed
        if (query.toString().includes('SELECT value FROM _meta WHERE key = \'version\'')) {
          return [{ value: 2 }];
        }
        if (query.toString().includes('SELECT value FROM _meta WHERE key = \'migration_status\'')) {
          return [{ value: 'ok' }];
        }
        return [];
      });
      
      // @ts-ignore
      migratingAgent.sql = mockSql;
      
      // Step 2: Verify migration fails and agent becomes locked
      await expect(migratingAgent.onStart()).rejects.toThrow();
      
      // Reset mock for status check
      mockSql.mockImplementation((query) => {
        if (query.toString().includes('SELECT value FROM _meta WHERE key = \'migration_status\'')) {
          return [{ value: 'failed' }];
        }
        return [];
      });
      
      // Step 3: Verify agent operations are blocked
      const blockedRequest = new Request('http://test.com/users', {
        method: 'GET'
      });
      
      const blockedResponse = await migratingAgent.onRequest(blockedRequest);
      expect(blockedResponse.status).toBe(503);
      
      // Step 4: Admin intervention - force unlock
      const adminAgent = new AdminAgent({}, mockEnv);
      vi.mocked(getAgentByName).mockResolvedValue(migratingAgent);
      
      const unlockRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-migrating-agent',
          agentType: 'MigratingAgent',
          adminKey: 'e2e-admin-secret'
        })
      });
      
      // Mock the admin operation to succeed
      vi.spyOn(migratingAgent, '_forceUnlock').mockResolvedValue({
        success: true,
        message: 'Agent unlocked successfully'
      });
      
      const unlockResponse = await adminAgent.onRequest(unlockRequest);
      expect(unlockResponse.status).toBe(200);
      
      const unlockResult = await unlockResponse.json();
      expect(unlockResult.success).toBe(true);
      
      // Step 5: Verify agent is now operational
      mockSql.mockImplementation((query) => {
        if (query.toString().includes('SELECT value FROM _meta WHERE key = \'migration_status\'')) {
          return [{ value: 'ok' }];
        }
        if (query.toString().includes('SELECT * FROM users ORDER BY id')) {
          return [];
        }
        return [];
      });
      
      const operationalRequest = new Request('http://test.com/users', {
        method: 'GET'
      });
      
      const operationalResponse = await migratingAgent.onRequest(operationalRequest);
      expect(operationalResponse.status).toBe(200);
    });

    it('should handle migration rerun scenario', async () => {
      // Step 1: Create agent with corrupted state
      const migratingAgent = new MigratingAgent({}, mockEnv);
      const adminAgent = new AdminAgent({}, mockEnv);
      vi.mocked(getAgentByName).mockResolvedValue(migratingAgent);
      
      // Step 2: Mock failed migration rerun
      vi.spyOn(migratingAgent, '_rerunMigration').mockResolvedValue({
        success: false,
        message: 'Schema corruption is too severe'
      });
      
      const rerunRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'rerun_migration',
          agentId: 'test-corrupted-agent',
          agentType: 'MigratingAgent',
          adminKey: 'e2e-admin-secret'
        })
      });
      
      const response = await adminAgent.onRequest(rerunRequest);
      expect(response.status).toBe(500);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Schema corruption');
      
      // Step 3: Retry with successful rerun
      vi.mocked(migratingAgent._rerunMigration).mockResolvedValueOnce({
        success: true,
        message: 'Migration completed successfully',
        version: 2
      });
      
      const retryResponse = await adminAgent.onRequest(rerunRequest);
      expect(retryResponse.status).toBe(200);
      
      const retryResult = await retryResponse.json();
      expect(retryResult.success).toBe(true);
      expect(retryResult.version).toBe(2);
    });
  });

  describe('Retry Logic Integration E2E', () => {
    it('should handle complete task failure and retry cycle', async () => {
      const reminderAgent = new ReminderAgent({}, mockEnv);
      
      // Mock schedule method
      const scheduleCalls: any[] = [];
      // @ts-ignore
      reminderAgent.schedule = vi.fn().mockImplementation((delay, method, payload) => {
        scheduleCalls.push({ delay, method, payload });
        return Promise.resolve({ id: `task-${Date.now()}` });
      });
      
      // Step 1: Set up a reminder that will fail multiple times
      const setRequest = new Request('http://test.com/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test reminder with failures',
          failFor: 3, // Will fail 3 times before succeeding
          maxRetries: 5
        })
      });
      
      const setResponse = await reminderAgent.onRequest(setRequest);
      expect(setResponse.status).toBe(202);
      
      const setResult = await setResponse.json();
      expect(setResult.status).toBe('Resilient reminder set!');
      expect(setResult.taskId).toBeDefined();
      
      // Verify initial scheduling
      expect(scheduleCalls).toHaveLength(1);
      expect(scheduleCalls[0].delay).toBe(1);
      expect(scheduleCalls[0].method).toBe('sendReminder');
      expect(scheduleCalls[0].payload.data.message).toBe('Test reminder with failures');
      expect(scheduleCalls[0].payload.retryCount).toBe(0);
      
      // Step 2: Simulate task execution with failures and retries
      const initialPayload = scheduleCalls[0].payload;
      
      // First attempt (retryCount: 0) - should fail and schedule retry
      await reminderAgent.sendReminder(initialPayload);
      
      // Should have scheduled a retry
      expect(scheduleCalls).toHaveLength(2);
      expect(scheduleCalls[1].delay).toBe(10); // 2^0 * 10 = 10
      expect(scheduleCalls[1].payload.retryCount).toBe(1);
      
      // Second attempt (retryCount: 1) - should fail and schedule retry
      await reminderAgent.sendReminder(scheduleCalls[1].payload);
      
      expect(scheduleCalls).toHaveLength(3);
      expect(scheduleCalls[2].delay).toBe(20); // 2^1 * 10 = 20
      expect(scheduleCalls[2].payload.retryCount).toBe(2);
      
      // Third attempt (retryCount: 2) - should fail and schedule retry
      await reminderAgent.sendReminder(scheduleCalls[2].payload);
      
      expect(scheduleCalls).toHaveLength(4);
      expect(scheduleCalls[3].delay).toBe(40); // 2^2 * 10 = 40
      expect(scheduleCalls[3].payload.retryCount).toBe(3);
      
      // Fourth attempt (retryCount: 3) - should succeed (>= failFor)
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await reminderAgent.sendReminder(scheduleCalls[3].payload);
      
      // Should not schedule another retry (success)
      expect(scheduleCalls).toHaveLength(4);
      
      // Should log success
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TaskSucceeded')
      );
      
      consoleSpy.mockRestore();
    });

    it('should abort after max retries', async () => {
      const reminderAgent = new ReminderAgent({}, mockEnv);
      
      // Mock schedule method
      const scheduleCalls: any[] = [];
      // @ts-ignore
      reminderAgent.schedule = vi.fn().mockImplementation((delay, method, payload) => {
        scheduleCalls.push({ delay, method, payload });
        return Promise.resolve({ id: `task-${Date.now()}` });
      });
      
      // Set up a reminder that will always fail
      const setRequest = new Request('http://test.com/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Always failing reminder',
          failFor: 10, // Will always fail (more than maxRetries)
          maxRetries: 2
        })
      });
      
      const setResponse = await reminderAgent.onRequest(setRequest);
      expect(setResponse.status).toBe(202);
      
      // Get initial payload
      const initialPayload = scheduleCalls[0].payload;
      
      // Simulate exhausting all retries
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // First attempt (retryCount: 0)
      await reminderAgent.sendReminder(initialPayload);
      expect(scheduleCalls).toHaveLength(2);
      
      // Second attempt (retryCount: 1)
      await reminderAgent.sendReminder(scheduleCalls[1].payload);
      expect(scheduleCalls).toHaveLength(3);
      
      // Third attempt (retryCount: 2) - should abort
      await reminderAgent.sendReminder(scheduleCalls[2].payload);
      
      // Should not schedule another retry
      expect(scheduleCalls).toHaveLength(3);
      
      // Should log abort
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TaskAborted')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cross-System Resilience E2E', () => {
    it('should handle coordinated failure recovery across multiple agent types', async () => {
      // Scenario: MigratingAgent fails, ReminderAgent needs to use exponential backoff,
      // and AdminAgent coordinates recovery
      
      const migratingAgent = new MigratingAgent({}, mockEnv);
      const reminderAgent = new ReminderAgent({}, mockEnv);
      const adminAgent = new AdminAgent({}, mockEnv);
      
      // Step 1: Simulate system-wide stress causing failures
      const mockSql = vi.fn().mockImplementation(() => {
        throw new Error('System overload - database unavailable');
      });
      
      // @ts-ignore
      migratingAgent.sql = mockSql;
      
      // Step 2: Migration agent fails
      await expect(migratingAgent.onStart()).rejects.toThrow();
      
      // Step 3: Reminder agent implements backoff during system stress
      // @ts-ignore
      reminderAgent.schedule = vi.fn().mockResolvedValue({ id: 'stress-task-123' });
      
      const reminderPayload = {
        data: {
          message: 'System recovery notification',
          failFor: 2
        },
        retryCount: 1,
        maxRetries: 5
      };
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await reminderAgent.sendReminder(reminderPayload);
      
      // Should implement exponential backoff (2^1 * 10 = 20 seconds)
      expect(reminderAgent.schedule).toHaveBeenCalledWith(
        20,
        'sendReminder',
        expect.objectContaining({
          retryCount: 2
        })
      );
      
      // Step 4: Admin intervention to restore system
      vi.mocked(getAgentByName).mockResolvedValue(migratingAgent);
      vi.spyOn(migratingAgent, '_forceUnlock').mockResolvedValue({
        success: true,
        message: 'System restored and agent unlocked'
      });
      
      const recoveryRequest = new Request('http://test.com/admin/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'system-agent',
          agentType: 'MigratingAgent',
          adminKey: 'e2e-admin-secret'
        })
      });
      
      const recoveryResponse = await adminAgent.onRequest(recoveryRequest);
      expect(recoveryResponse.status).toBe(200);
      
      const recoveryResult = await recoveryResponse.json();
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.message).toContain('System restored');
      
      consoleSpy.mockRestore();
    });
  });
});