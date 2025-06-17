import type { OnboardingWorkflowParams } from '../agents/OnboardingAgent';
import { WorkflowLogger } from '../utils/logger';

export interface WorkflowInstance {
  id: string;
}

interface EmailStep {
  type: 'welcome' | 'setup' | 'tips' | 'followup';
  subject: string;
  delayHours: number;
}

export class EmailWorkflow {
  private static readonly EMAIL_SEQUENCE: EmailStep[] = [
    {
      type: 'welcome',
      subject: 'Welcome to our platform!',
      delayHours: 0
    },
    {
      type: 'setup',
      subject: 'Complete your profile setup',
      delayHours: 24
    },
    {
      type: 'tips',
      subject: 'Pro tips to get started',
      delayHours: 72
    },
    {
      type: 'followup',
      subject: 'How are you finding the platform?',
      delayHours: 168 // 1 week
    }
  ];

  static async create(options: { id: string; params: OnboardingWorkflowParams }): Promise<WorkflowInstance> {
    const logger = new WorkflowLogger('EmailWorkflow', options.id);
    
    logger.info('workflow.created', 'Email workflow created', {
      params: options.params,
      totalSteps: this.EMAIL_SEQUENCE.length
    });

    // In a real implementation, this would trigger the actual workflow
    // For now, we'll simulate immediate execution
    const workflow = new EmailWorkflow();
    workflow.run(options.params).catch(err => {
      logger.error('workflow.execution.failed', 'Workflow execution failed', { error: err.message });
    });

    return {
      id: options.id
    };
  }

  async run(params: OnboardingWorkflowParams): Promise<void> {
    const logger = new WorkflowLogger('EmailWorkflow', `onboarding-${params.userId}`);
    
    logger.info('workflow.started', 'Starting email onboarding sequence', {
      userId: params.userId,
      totalSteps: EmailWorkflow.EMAIL_SEQUENCE.length
    });

    for (const [index, step] of EmailWorkflow.EMAIL_SEQUENCE.entries()) {
      try {
        if (step.delayHours > 0) {
          await this.sleep(step.delayHours * 60 * 60 * 1000); // Convert hours to milliseconds
        }

        await this.sendEmail(params.userId, step, logger);
        
        logger.info('email.sent', `Email sent: ${step.subject}`, {
          userId: params.userId,
          stepIndex: index + 1,
          totalSteps: EmailWorkflow.EMAIL_SEQUENCE.length,
          emailType: step.type,
          subject: step.subject
        });

      } catch (error) {
        logger.error('email.failed', `Failed to send email: ${step.subject}`, {
          userId: params.userId,
          stepIndex: index + 1,
          emailType: step.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // In production, you might want to retry or handle failures differently
        throw error;
      }
    }

    logger.info('workflow.completed', 'Email onboarding sequence completed', {
      userId: params.userId,
      totalEmailsSent: EmailWorkflow.EMAIL_SEQUENCE.length
    });
  }

  private async sendEmail(userId: string, step: EmailStep, logger: WorkflowLogger): Promise<void> {
    // In a real implementation, this would use a service like SendGrid, Mailgun, etc.
    // For demo purposes, we'll simulate the email sending
    
    const emailContent = this.generateEmailContent(userId, step);
    
    // Simulate API call delay
    await this.sleep(100 + Math.random() * 200);
    
    // Simulate occasional failures in non-production environments
    if (Math.random() < 0.05) { // 5% failure rate for testing
      throw new Error(`Email service temporarily unavailable for ${step.type}`);
    }
    
    // Log the email content for debugging
    logger.debug('email.content', 'Email content generated', {
      userId,
      emailType: step.type,
      subject: step.subject,
      contentPreview: emailContent.substring(0, 100) + '...'
    });
  }

  private generateEmailContent(userId: string, step: EmailStep): string {
    const templates = {
      welcome: `Hi there! Welcome to our platform. We're excited to have you on board. Get started by exploring your dashboard and setting up your profile.`,
      setup: `Hi! We noticed you haven't completed your profile setup yet. Take a few minutes to add your information - it helps us personalize your experience.`,
      tips: `Here are some pro tips to help you get the most out of our platform: 1) Connect your integrations 2) Set up notifications 3) Explore advanced features.`,
      followup: `How are you finding the platform so far? We'd love to hear your feedback and help you with any questions you might have.`
    };

    return `${templates[step.type]}\n\nBest regards,\nThe Team\n\n---\nUser ID: ${userId}`;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}