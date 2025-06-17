import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export interface UserV1DTO {
  version: "v1";
  id: string;
  message: string;
}

export class UserAgentV1 extends Agent<WorkerEnv> {
  async getProfile(): Promise<UserV1DTO> {
    const userId = this.name;
    return {
      version: "v1",
      id: userId,
      message: `User profile for ${userId} (V1 API)`
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
    
    return new Response('Not Found', { status: 404 });
  }
}