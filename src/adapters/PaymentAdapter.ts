import { getAgentByName } from 'agents';
import type { WorkerEnv } from '../types';

export class PaymentAdapter {
  static async charge(env: WorkerEnv, userId: string, amountDollars: number): Promise<any> {
    const agentId = `payment-${userId}`;
    const paymentAgent = await getAgentByName(env.PAYMENT_AGENT_V1, agentId);

    // The adapter converts dollars to cents for the legacy V1 agent
    const amountCents = Math.round(amountDollars * 100);

    // Call the legacy method
    return (paymentAgent as any).chargeInCents(amountCents);
  }
}