import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export interface OnboardingWorkflowParams {
  userId: string;
}

export class OnboardingAgent extends Agent<WorkerEnv> {
  async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS tracked_workflows (
      id TEXT PRIMARY KEY,
      status TEXT,
      started_at TEXT
    )`;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'POST' && url.pathname.endsWith('/start')) {
      try {
        const body = await request.json();
        const { userId } = body;

        if (!userId || typeof userId !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid userId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return this.startOnboarding(userId);
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  async startOnboarding(userId: string): Promise<Response> {
    try {
      const instance = await this.env.EMAIL_WORKFLOW.create({
        id: `onboarding-${userId}`,
        params: { userId }
      });

      await this.sql`
        INSERT INTO tracked_workflows (id, status, started_at) 
        VALUES (${instance.id}, 'started', ${new Date().toISOString()})
      `;

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'OnboardingAgent',
        agentId: this.name,
        eventType: 'workflow.started',
        level: 'info',
        message: 'Onboarding workflow triggered',
        data: { userId, instanceId: instance.id }
      }));

      return new Response(JSON.stringify({
        status: 'Onboarding workflow triggered',
        instanceId: instance.id
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'OnboardingAgent',
        agentId: this.name,
        eventType: 'workflow.start_failed',
        level: 'error',
        message: 'Failed to start onboarding workflow',
        data: { 
          userId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }
      }));

      return new Response(JSON.stringify({
        error: 'Failed to start workflow'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}