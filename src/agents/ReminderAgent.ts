import { Agent } from 'agents';
import type { WorkerEnv } from '../types';
import { AgentLogger } from '../utils/logger';

export interface SetReminderRequest {
  message: string;
  failFor: number;
  maxRetries: number;
}

export interface ResilientTaskPayload {
  message: string;
  failFor: number;
  maxRetries: number;
  retryCount: number;
}

export class ReminderAgent extends Agent<WorkerEnv> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'POST' && url.pathname.endsWith('/set')) {
      try {
        const body = await request.json() as SetReminderRequest;
        const { message, failFor, maxRetries } = body;

        if (!message || typeof message !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid message' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await this.setReminder({ message, failFor, maxRetries });
        return new Response(JSON.stringify(result), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  async setReminder(data: SetReminderRequest) {
    const payload: ResilientTaskPayload = {
      ...data,
      retryCount: 0,
    };
    const { id } = await this.schedule(1, "sendReminder", payload);
    return { status: "Resilient reminder set!", taskId: id };
  }

  async sendReminder(payload: ResilientTaskPayload) {
    const { message, failFor, maxRetries, retryCount } = payload;
    const logger = new AgentLogger('ReminderAgent', this.name);

    try {
      if (retryCount < failFor) {
        throw new Error(`Intentionally failing for test purposes. Attempt #${retryCount + 1}.`);
      }
      logger.info('TaskSucceeded', `Reminder '${message}' sent successfully.`);
    } catch (e) {
      logger.warn('TaskFailed', `Attempt #${retryCount + 1} failed for reminder '${message}'.`, { error: e instanceof Error ? e.message : 'Unknown error' });

      if (retryCount < maxRetries) {
        const nextRetryCount = retryCount + 1;
        const delayInSeconds = Math.pow(2, retryCount) * 10;
        logger.info('TaskRetrying', `Scheduling retry #${nextRetryCount} in ${delayInSeconds}s.`);
        await this.schedule(delayInSeconds, "sendReminder", { ...payload, retryCount: nextRetryCount });
      } else {
        logger.error('TaskAborted', `Reminder '${message}' has failed maximum retries (${maxRetries}) and is being aborted.`);
      }
    }
  }
}