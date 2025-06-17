import { Agent } from "agents";
import type { WorkerEnv } from "../types";

const LATEST_SCHEMA_VERSION = 2;

export class MigratingAgent extends Agent<WorkerEnv, {}> {
  private migrationFailed = false;

  async onStart(): Promise<void> {
    try {
      await this.sql`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER)`;
      
      const result = await this.sql`SELECT value FROM _meta WHERE key = 'version'`;
      const version = result.length > 0 ? (result[0].value as number) : 0;

      if (version < 1) {
        console.log(`Migrating ${this.name} from version 0 to 1`);
        await this.sql`CREATE TABLE users (id TEXT, name TEXT)`;
        await this.sql`INSERT INTO _meta (key, value) VALUES ('version', 1) ON CONFLICT(key) DO UPDATE SET value = 1`;
      }

      if (version < 2) {
        console.log(`Migrating ${this.name} from version 1 to 2`);
        await this.sql`ALTER TABLE users ADD COLUMN email TEXT`;
        await this.sql`UPDATE _meta SET value = 2 WHERE key = 'version'`;
      }

      console.log(`Agent ${this.name} is at schema version ${LATEST_SCHEMA_VERSION}`);
    } catch (error) {
      console.error(`Migration failed for agent ${this.name}:`, error);
      this.migrationFailed = true;
    }
  }

  private checkMigrationStatus(): void {
    if (this.migrationFailed) {
      throw new Error('Agent is locked due to migration failure. Manual intervention required.');
    }
  }

  async addUser(id: string, name: string, email?: string): Promise<void> {
    this.checkMigrationStatus();
    
    // Validate inputs
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('User ID must be a non-empty string');
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('User name must be a non-empty string');
    }
    if (email !== undefined && (typeof email !== 'string' || !email.includes('@'))) {
      throw new Error('Email must be a valid email address');
    }
    
    // Trim inputs
    const trimmedId = id.trim();
    const trimmedName = name.trim();
    const trimmedEmail = email?.trim();
    
    await this.sql`INSERT INTO users (id, name, email) VALUES (${trimmedId}, ${trimmedName}, ${trimmedEmail || null})`;
  }

  async getUsers(): Promise<any[]> {
    this.checkMigrationStatus();
    return await this.sql`SELECT * FROM users ORDER BY id`;
  }

  async onRequest(request: Request): Promise<Response> {
    try {
      this.checkMigrationStatus();
      
      if (request.method === 'POST') {
        let body: { id?: string; name?: string; email?: string };
        
        try {
          body = await request.json() as { id?: string; name?: string; email?: string };
        } catch (error) {
          return new Response('Invalid JSON in request body', { status: 400 });
        }
        
        const { id, name, email } = body;
        if (!id || !name) {
          return new Response('Missing required fields: id and name are required', { status: 400 });
        }
        
        try {
          await this.addUser(id, name, email);
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('User ID') || error.message.includes('User name') || error.message.includes('Email')) {
              return new Response(error.message, { status: 400 });
            }
            if (error.message.includes('UNIQUE constraint failed')) {
              return new Response('User with this ID already exists', { status: 409 });
            }
          }
          throw error; // Re-throw unexpected errors
        }
      }
      
      const users = await this.getUsers();
      return new Response(JSON.stringify(users), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('MigratingAgent onRequest error:', error);
      if (error instanceof Error && error.message.includes('migration failure')) {
        return new Response('Agent unavailable due to migration failure', { status: 503 });
      }
      return new Response('Internal server error', { status: 500 });
    }
  }
}