import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminAgent } from '../../../src/agents/AdminAgent';
import { MigratingAgent } from '../../../src/agents/MigratingAgent';
import type { WorkerEnv } from '../../../src/types';

// Mock getAgentByName
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public state: any = {}, public env: any = {}) {}
  },
  getAgentByName: vi.fn()
}));

const { getAgentByName } = await import('agents');

describe('AdminAgent', () => {
  let mockEnv: WorkerEnv;
  let adminAgent: AdminAgent;
  let mockMigratingAgent: Partial<MigratingAgent>;

  beforeEach(() => {
    mockEnv = {
      ADMIN_SECRET_KEY: 'test-admin-secret',
      MIGRATING_AGENT: {} as any
    } as WorkerEnv;

    adminAgent = new AdminAgent({}, mockEnv);

    mockMigratingAgent = {
      _forceUnlock: vi.fn(),
      _rerunMigration: vi.fn()
    };

    vi.mocked(getAgentByName).mockResolvedValue(mockMigratingAgent as MigratingAgent);
  });

  describe('Authentication', () => {
    it('should reject requests without admin key', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'MigratingAgent'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(401);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Unauthorized');
    });

    it('should reject requests with invalid admin key', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'wrong-key'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(401);
    });

    it('should accept requests with valid admin key', async () => {
      vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue({
        success: true,
        message: 'Agent unlocked successfully'
      });

      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Validation', () => {
    it('should reject non-POST requests', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'GET'
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(405);
    });

    it('should validate required fields', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminKey: 'test-admin-secret'
          // Missing operation, agentId, agentType
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.message).toContain('Missing required fields');
    });

    it('should reject unsupported agent types', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'UnsupportedAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.message).toContain('Unsupported agent type');
    });
  });

  describe('Force Unlock Operation', () => {
    it('should execute force unlock successfully', async () => {
      const expectedResult = {
        success: true,
        message: 'Agent test-agent has been force unlocked. Please verify data integrity.'
      };
      
      vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue(expectedResult);

      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body).toEqual(expectedResult);
      expect(mockMigratingAgent._forceUnlock).toHaveBeenCalledTimes(1);
    });

    it('should handle force unlock failures', async () => {
      const expectedResult = {
        success: false,
        message: 'Failed to unlock agent: Database error'
      };
      
      vi.mocked(mockMigratingAgent._forceUnlock!).mockResolvedValue(expectedResult);

      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body).toEqual(expectedResult);
    });
  });

  describe('Rerun Migration Operation', () => {
    it('should execute rerun migration successfully', async () => {
      const expectedResult = {
        success: true,
        message: 'Migration completed successfully for agent test-agent',
        version: 2
      };
      
      vi.mocked(mockMigratingAgent._rerunMigration!).mockResolvedValue(expectedResult);

      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'rerun_migration',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body).toEqual(expectedResult);
      expect(mockMigratingAgent._rerunMigration).toHaveBeenCalledTimes(1);
    });

    it('should handle rerun migration failures', async () => {
      const expectedResult = {
        success: false,
        message: 'Migration rerun failed: Schema corruption detected'
      };
      
      vi.mocked(mockMigratingAgent._rerunMigration!).mockResolvedValue(expectedResult);

      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'rerun_migration',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body).toEqual(expectedResult);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown operations', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'unknown_op',
          agentId: 'test-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Unknown operation');
    });

    it('should handle agent lookup failures', async () => {
      vi.mocked(getAgentByName).mockRejectedValue(new Error('Agent not found'));

      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'force_unlock',
          agentId: 'nonexistent-agent',
          agentType: 'MigratingAgent',
          adminKey: 'test-admin-secret'
        })
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Failed to execute operation');
    });

    it('should handle invalid JSON', async () => {
      const request = new Request('http://test.com/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const response = await adminAgent.onRequest(request);
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Request processing failed');
    });
  });
});