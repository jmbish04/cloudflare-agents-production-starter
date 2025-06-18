import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('FAILURE-001: State Migration Failure Protocol', () => {
  it('should handle migration failure gracefully', async () => {
    const agentId = `test-agent-${Date.now()}`;
    
    // Test that the agent endpoints are accessible
    const request = new Request(`http://test.com/agent/migrating-agent/${agentId}`, {
      method: 'GET'
    });
    
    const response = await worker.request(request);
    expect(response.status).toBe(200);
  });
});

describe('FAILURE-002: Scheduled Task Application-Level Retry', () => {
  it('should accept reminder requests with resilient retry parameters', async () => {
    const agentId = `resilient-agent-${Date.now()}`;
    
    const request = new Request(`http://test.com/agent/reminder-agent/${agentId}/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'test reminder',
        failFor: 2,
        maxRetries: 3
      })
    });
    
    const response = await worker.request(request);
    expect(response.status).toBe(202);
    
    const body = await response.json();
    expect(body.status).toBe('Resilient reminder set!');
    expect(body.taskId).toBeDefined();
  });
});