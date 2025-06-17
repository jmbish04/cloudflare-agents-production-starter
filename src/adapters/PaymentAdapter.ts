import { getAgentByName } from 'agents';
import type { WorkerEnv } from '../types';

interface PaymentVersionConfig {
  version: 'v1' | 'v2';
  features?: string[];
}

export class PaymentAdapter {
  private static getPaymentVersion(userId: string): PaymentVersionConfig {
    // Dynamic version resolution logic
    // This could be based on user preferences, feature flags, A/B testing, etc.
    
    // Example logic: premium users get v2, others get v1
    const isPremiumUser = userId.includes('premium') || userId.includes('enterprise');
    
    if (isPremiumUser) {
      return { version: 'v2', features: ['advanced-fraud-detection', 'multi-currency'] };
    }
    
    return { version: 'v1' };
  }

  static async charge(env: WorkerEnv, userId: string, amountDollars: number): Promise<any> {
    const versionConfig = this.getPaymentVersion(userId);
    const agentId = `payment-${userId}`;

    switch (versionConfig.version) {
      case 'v1': {
        const paymentAgent = await getAgentByName(env.PAYMENT_AGENT_V1, agentId);
        // Convert dollars to cents for legacy V1 agent
        const amountCents = Math.round(amountDollars * 100);
        return (paymentAgent as any).chargeInCents(amountCents);
      }
      case 'v2': {
        // Future: when PAYMENT_AGENT_V2 is implemented
        // const paymentAgent = await getAgentByName(env.PAYMENT_AGENT_V2, agentId);
        // return (paymentAgent as any).chargeInDollars(amountDollars);
        
        // Fallback to V1 for now
        const fallbackAgent = await getAgentByName(env.PAYMENT_AGENT_V1, agentId);
        const amountCents = Math.round(amountDollars * 100);
        return (fallbackAgent as any).chargeInCents(amountCents);
      }
      default:
        throw new Error(`Unsupported payment version: ${versionConfig.version}`);
    }
  }

  static async getVersion(userId: string): Promise<PaymentVersionConfig> {
    return this.getPaymentVersion(userId);
  }
}