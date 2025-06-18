import { Agent, getAgentByName } from 'agents';
import type { WorkerEnv } from '../types';
import { MigratingAgent } from './MigratingAgent';

interface AdminRequest {
  operation: 'force_unlock' | 'rerun_migration';
  agentId: string;
  agentType: 'MigratingAgent';
  adminKey?: string;
}

interface AdminResponse {
  success: boolean;
  message: string;
  data?: any;
}

export class AdminAgent extends Agent<WorkerEnv> {
  private isAuthorized(adminKey?: string): boolean {
    // In production, this should verify against a secure admin key
    // For now, require a specific admin key from environment
    const expectedKey = this.env.ADMIN_SECRET_KEY;
    return expectedKey && adminKey === expectedKey;
  }

  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json() as AdminRequest;
      const { operation, agentId, agentType, adminKey } = body;

      // Validate authorization
      if (!this.isAuthorized(adminKey)) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Unauthorized: Invalid admin key'
        }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate required fields
      if (!operation || !agentId || !agentType) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Missing required fields: operation, agentId, agentType'
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Only support MigratingAgent for now
      if (agentType !== 'MigratingAgent') {
        return new Response(JSON.stringify({
          success: false,
          message: 'Unsupported agent type. Only MigratingAgent is supported.'
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await this.executeAdminOperation(operation, agentId);
      
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        message: `Request processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async executeAdminOperation(
    operation: AdminRequest['operation'], 
    agentId: string
  ): Promise<AdminResponse> {
    try {
      // Get the target agent instance
      const agent = await getAgentByName(this.env.MIGRATING_AGENT, agentId) as MigratingAgent;

      switch (operation) {
        case 'force_unlock':
          return await agent._forceUnlock();
          
        case 'rerun_migration':
          return await agent._rerunMigration();
          
        default:
          return {
            success: false,
            message: `Unknown operation: ${operation}`
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to execute operation: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}