import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderAgent } from '../src/agents/ReminderAgent';
import { ScheduleManagerAgent } from '../src/agents/ScheduleManagerAgent';
import { OnboardingAgent } from '../src/agents/OnboardingAgent';

vi.mock('agents', () => {
  class TestAgent {
    name: string;
    state: any;
    sql: any;
    env: any;
    
    constructor(state: any, env: any) {
      this.name = 'test-agent';
      this.state = {};
      this.env = env;
      this.sql = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join('?');
        console.log('Mock SQL query:', query, values);
        
        if (query.includes('CREATE TABLE')) {
          return undefined;
        }
        if (query.includes('INSERT')) {
          return undefined;
        }
        if (query.includes('SELECT') && query.includes('tracked_workflows')) {
          return [{
            id: 'onboarding-user-123',
            status: 'started',
            started_at: new Date().toISOString()
          }];
        }
        if (query.includes('SELECT')) {
          return [{ value: 0 }];
        }
        return [];
      });
    }

    async schedule(delaySeconds: number, method: string, data: any) {
      const taskId = `task-${Date.now()}`;
      console.log(`Mock schedule: ${method} in ${delaySeconds}s with data:`, data);
      return { id: taskId };
    }

    async cancelSchedule(taskId: string): Promise<boolean> {
      console.log(`Mock cancel schedule: ${taskId}`);
      return Math.random() > 0.5; // Randomly succeed/fail for testing
    }

    setState(newState: any) {
      this.state = { ...this.state, ...newState };
      console.log('Mock setState:', this.state);
    }
  }

  return {
    Agent: TestAgent,
    getAgentByName: vi.fn(async (binding: any, id: string) => {
      return new TestAgent({}, {});
    })
  };
});

describe('Orchestration and Autonomy Features', () => {
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      EMAIL_WORKFLOW: {
        create: vi.fn(async (options: any) => {
          console.log('Mock workflow create:', options);
          return { id: options.id };
        })
      }
    };
  });

  describe('ReminderAgent', () => {
    it('should set a reminder successfully', async () => {
      const agent = new ReminderAgent({}, mockEnv);
      const request = new Request('http://test.com/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test reminder',
          delaySeconds: 30,
          failFor: 0
        })
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBe('Resilient reminder set!');
      expect(body.taskId).toBeDefined();
    });

    it('should handle invalid JSON in request', async () => {
      const agent = new ReminderAgent({}, mockEnv);
      const request = new Request('http://test.com/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid JSON');
    });

    it('should validate message field', async () => {
      const agent = new ReminderAgent({}, mockEnv);
      const request = new Request('http://test.com/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delaySeconds: 30 })
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid message');
    });

    it('should handle reminder success after retries', async () => {
      const agent = new ReminderAgent({}, mockEnv);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await agent.sendReminder({
        message: 'Test message',
        delaySeconds: 10,
        failFor: 2,
        retryCount: 2 // At failFor limit, should succeed
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUCCESS: Reminder sent: Test message')
      );
      consoleSpy.mockRestore();
    });

    it('should retry on failure with exponential backoff', async () => {
      const agent = new ReminderAgent({}, mockEnv);
      const scheduleRetry = vi.spyOn(agent, 'schedule');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await agent.sendReminder({
        message: 'Test message',
        delaySeconds: 10,
        failFor: 3,
        retryCount: 1 // Will fail and schedule retry
      });

      expect(scheduleRetry).toHaveBeenCalledWith(
        40, // 2^2 * 10 = 40 seconds
        'sendReminder',
        expect.objectContaining({
          message: 'Test message',
          retryCount: 2
        })
      );
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Task failed: Intentionally failing')
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should stop retrying after max attempts', async () => {
      const agent = new ReminderAgent({}, mockEnv);
      const scheduleRetry = vi.spyOn(agent, 'schedule');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await agent.sendReminder({
        message: 'Test message',
        delaySeconds: 10,
        failFor: 10,
        retryCount: 5 // At max retry limit
      });

      expect(scheduleRetry).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Max retries exceeded')
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('ScheduleManagerAgent', () => {
    it('should schedule a follow-up task', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      const request = new Request('http://test.com/schedule', {
        method: 'POST'
      });

      const response = await agent.scheduleFollowUp();
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBe('Task scheduled');
      expect(body.taskId).toBeDefined();
      expect(agent.state.followUpTaskId).toBeDefined();
    });

    it('should prevent scheduling multiple tasks', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      agent.setState({ followUpTaskId: 'existing-task-id' });

      const response = await agent.scheduleFollowUp();
      expect(response.status).toBe(409);
      
      const body = await response.json();
      expect(body.status).toBe('A follow-up is already scheduled.');
      expect(body.currentTaskId).toBe('existing-task-id');
    });

    it('should cancel a scheduled task successfully', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      agent.setState({ followUpTaskId: 'task-to-cancel' });
      
      // Mock successful cancellation
      vi.spyOn(agent, 'cancelSchedule').mockResolvedValue(true);

      const response = await agent.cancelFollowUp();
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBe('Task cancelled');
      expect(body.wasCancelled).toBe(true);
      expect(agent.state.followUpTaskId).toBeUndefined();
    });

    it('should handle cancellation of non-existent task', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      // No followUpTaskId set

      const response = await agent.cancelFollowUp();
      expect(response.status).toBe(404);
      
      const body = await response.json();
      expect(body.status).toBe('No task to cancel.');
    });

    it('should handle failed task cancellation', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      agent.setState({ followUpTaskId: 'already-executed-task' });
      
      // Mock failed cancellation
      vi.spyOn(agent, 'cancelSchedule').mockResolvedValue(false);

      const response = await agent.cancelFollowUp();
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.status).toBe('Task cancelled');
      expect(body.wasCancelled).toBe(false);
      // State should NOT be cleared on failed cancellation
      expect(agent.state.followUpTaskId).toBe('already-executed-task');
    });

    it('should clean up state when follow-up executes', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      agent.setState({ followUpTaskId: 'executing-task' });

      await agent.sendFollowUp();
      
      expect(agent.state.followUpTaskId).toBeUndefined();
    });

    it('should handle routing correctly', async () => {
      const agent = new ScheduleManagerAgent({}, mockEnv);
      
      const scheduleRequest = new Request('http://test.com/agent/schedule-manager-agent/test-id/schedule', {
        method: 'POST'
      });
      
      const cancelRequest = new Request('http://test.com/agent/schedule-manager-agent/test-id/cancel', {
        method: 'POST'
      });
      
      const invalidRequest = new Request('http://test.com/agent/schedule-manager-agent/test-id/invalid', {
        method: 'POST'
      });

      const scheduleResponse = await agent.onRequest(scheduleRequest);
      expect(scheduleResponse.status).toBe(200);

      agent.setState({ followUpTaskId: 'some-task' });
      const cancelResponse = await agent.onRequest(cancelRequest);
      expect(cancelResponse.status).toBe(200);

      const invalidResponse = await agent.onRequest(invalidRequest);
      expect(invalidResponse.status).toBe(404);
    });
  });

  describe('OnboardingAgent', () => {
    it('should create SQL table on start', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      
      await agent.onStart();
      
      expect(agent.sql).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('CREATE TABLE IF NOT EXISTS tracked_workflows')])
      );
    });

    it('should start onboarding workflow successfully', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      const request = new Request('http://test.com/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-123' })
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(202);
      
      const body = await response.json();
      expect(body.status).toBe('Workflow triggered.');
      expect(body.instanceId).toBe('onboarding-user-123');
      
      expect(mockEnv.EMAIL_WORKFLOW.create).toHaveBeenCalledWith({
        id: 'onboarding-user-123',
        params: { userId: 'user-123' }
      });
    });

    it('should validate userId field', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      const request = new Request('http://test.com/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid userId');
    });

    it('should handle workflow creation failure', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      mockEnv.EMAIL_WORKFLOW.create.mockRejectedValue(new Error('Workflow service unavailable'));

      const response = await agent.startOnboarding('user-456');
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error).toBe('Failed to start workflow');
    });

    it('should track workflow in SQL database', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      
      await agent.startOnboarding('user-789');
      
      expect(agent.sql).toHaveBeenCalled();
    });

    it('should handle invalid JSON in request', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      const request = new Request('http://test.com/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid JSON');
    });

    it('should handle non-start endpoints', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      const request = new Request('http://test.com/invalid', {
        method: 'POST'
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(404);
    });

    it('should return tracked workflows via get-tracked endpoint', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      const request = new Request('http://test.com/get-tracked', {
        method: 'GET'
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual({
        id: 'onboarding-user-123',
        status: 'started',
        started_at: expect.any(String)
      });
    });

    it('should handle SQL query errors in get-tracked endpoint', async () => {
      const agent = new OnboardingAgent({}, mockEnv);
      
      // Mock SQL to throw an error
      agent.sql = vi.fn(() => {
        throw new Error('Database error');
      });
      
      const request = new Request('http://test.com/get-tracked', {
        method: 'GET'
      });

      const response = await agent.onRequest(request);
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error).toBe('Failed to retrieve tracked workflows');
    });
  });
});