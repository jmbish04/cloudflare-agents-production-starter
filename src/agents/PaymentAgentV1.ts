import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export class PaymentAgentV1 extends Agent<WorkerEnv> {
  async chargeInCents(amountCents: number): Promise<any> {
    // Simulate legacy payment processing
    const paymentId = `pay_${Date.now()}`;
    
    // Legacy V1 logic - works with cents
    if (amountCents < 50) {
      return {
        status: 'failed',
        error: 'Minimum charge is 50 cents',
        paymentId,
        amountCents
      };
    }
    
    return {
      status: 'charged_in_cents',
      paymentId,
      amountCents,
      timestamp: new Date().toISOString()
    };
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'POST' && url.pathname.endsWith('/charge')) {
      try {
        const { amountCents } = await request.json() as { amountCents: number };
        const result = await this.chargeInCents(amountCents);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response('Invalid request body', { status: 400 });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
}