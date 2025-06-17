import type { OnboardingWorkflowParams } from '../agents/OnboardingAgent';

export interface WorkflowInstance {
  id: string;
}

export class EmailWorkflow {
  static async create(options: { id: string; params: OnboardingWorkflowParams }): Promise<WorkflowInstance> {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      workflowClass: 'EmailWorkflow',
      workflowId: options.id,
      eventType: 'workflow.created',
      level: 'info',
      message: 'Email workflow created (placeholder)',
      data: { params: options.params }
    }));

    return {
      id: options.id
    };
  }

  async run(params: OnboardingWorkflowParams): Promise<void> {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      workflowClass: 'EmailWorkflow',
      eventType: 'workflow.running',
      level: 'info',
      message: 'Running email workflow (placeholder)',
      data: { params }
    }));
  }
}