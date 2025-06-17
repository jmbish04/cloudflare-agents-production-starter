import { Agent } from 'agents';
import type { WorkerEnv } from '../types';
import { PaymentAdapter } from '../adapters/PaymentAdapter';

export interface UserV2DTO {
  apiVersion: "v2";
  userId: string;
  status: string;
  paymentResult?: any;
}

export class UserAgentV2 extends Agent<WorkerEnv> {
  async getProfile(): Promise<UserV2DTO> {
    const userId = this.name;
    return {
      apiVersion: "v2",
      userId,
      status: "active"
    };
  }

  async upgradeSubscription(): Promise<UserV2DTO> {
    const userId = this.name;
    const upgradeCost = 25.00; // V2 logic uses dollars

    // Call the adapter, not the agent directly
    const paymentResult = await PaymentAdapter.charge(this.env, userId, upgradeCost);

    // V2 DTO
    return {
      apiVersion: "v2",
      userId: userId,
      status: "upgraded",
      paymentResult: paymentResult,
    };
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'GET' && url.pathname.endsWith('/profile')) {
      const profile = await this.getProfile();
      return new Response(JSON.stringify(profile), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'POST' && url.pathname.endsWith('/upgrade')) {
      const result = await this.upgradeSubscription();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
}