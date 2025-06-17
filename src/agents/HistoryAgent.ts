import { Agent } from "agents";
import type { WorkerEnv } from "../types";

interface MessageRecord {
  id: number;
  text: string;
}

export class HistoryAgent extends Agent<WorkerEnv, {}> {
  async onStart(): Promise<void> {
    await this.sql`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, text TEXT)`;
  }

  async addMessage(text: string): Promise<any> {
    return await this.sql`INSERT INTO messages (text) VALUES (${text}) RETURNING id`;
  }

  async getMessages(): Promise<MessageRecord[]> {
    return await this.sql`SELECT * FROM messages ORDER BY id ASC`;
  }

  async onRequest(request: Request): Promise<Response> {
    try {
      if (request.method === "POST") {
        let body: { text?: string };
        try {
          body = await request.json<{ text: string }>();
        } catch (error) {
          return new Response('Invalid JSON in request body', { status: 400 });
        }
        
        if (typeof body.text !== 'string') {
          return new Response('Missing or invalid "text" field', { status: 400 });
        }
        
        if (body.text.length > 10000) {
          return new Response('Message text too long (max 10000 characters)', { status: 400 });
        }
        
        await this.addMessage(body.text);
      }
      
      const messages = await this.getMessages();
      return Response.json(messages);
    } catch (error) {
      console.error(`HistoryAgent error:`, error);
      return new Response('Internal server error', { status: 500 });
    }
  }
}