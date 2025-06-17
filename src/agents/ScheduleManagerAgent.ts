import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export interface ScheduleManagerState {
  followUpTaskId?: string;
}

export class ScheduleManagerAgent extends Agent<WorkerEnv, ScheduleManagerState> {
  initialState: ScheduleManagerState = {};

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'POST' && url.pathname.endsWith('/schedule')) {
      return this.scheduleFollowUp();
    }

    if (method === 'POST' && url.pathname.endsWith('/cancel')) {
      return this.cancelFollowUp();
    }

    return new Response('Not Found', { status: 404 });
  }

  async scheduleFollowUp(): Promise<Response> {
    if (this.state.followUpTaskId) {
      return new Response(JSON.stringify({
        error: 'A follow-up is already scheduled.',
        currentTaskId: this.state.followUpTaskId
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { id } = await this.schedule(3600, 'sendFollowUp', {});
    this.setState({ followUpTaskId: id });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      agentClass: 'ScheduleManagerAgent',
      agentId: this.name,
      eventType: 'task.scheduled',
      level: 'info',
      message: 'Follow-up task scheduled',
      data: { taskId: id, delaySeconds: 3600 }
    }));

    return new Response(JSON.stringify({
      status: 'Task scheduled',
      taskId: id
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async cancelFollowUp(): Promise<Response> {
    if (!this.state.followUpTaskId) {
      return new Response(JSON.stringify({
        error: 'No task to cancel.'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const taskId = this.state.followUpTaskId;
    const wasCancelled = await this.cancelSchedule(taskId);
    
    if (wasCancelled) {
      this.setState({ followUpTaskId: undefined });
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'ScheduleManagerAgent',
        agentId: this.name,
        eventType: 'task.cancelled',
        level: 'info',
        message: 'Follow-up task cancelled successfully',
        data: { taskId, wasCancelled }
      }));
    } else {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'ScheduleManagerAgent',
        agentId: this.name,
        eventType: 'task.cancel_failed',
        level: 'warn',
        message: 'Task cancellation failed - task may have already executed',
        data: { taskId, wasCancelled }
      }));
    }

    return new Response(JSON.stringify({
      status: 'Task cancelled',
      wasCancelled
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async sendFollowUp(): Promise<void> {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      agentClass: 'ScheduleManagerAgent',
      agentId: this.name,
      eventType: 'followup.sent',
      level: 'info',
      message: 'Sending follow-up email',
      data: {}
    }));

    this.setState({ followUpTaskId: undefined });
  }
}