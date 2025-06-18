import { Agent } from "agents";
import type { WorkerEnv } from "../types";

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface ChatHistoryAgentState {
  lastMessageTimestamp: number;
}

export class ChatHistoryAgent extends Agent<WorkerEnv, ChatHistoryAgentState> {
  initialState = { lastMessageTimestamp: 0 };

  async onStart(): Promise<void> {
    await this.sql`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )`;
  }

  async addMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<ChatMessage> {
    const createdAt = new Date().toISOString();
    
    const [result] = await this.sql`
      INSERT INTO messages (role, content, createdAt) 
      VALUES (${role}, ${content}, ${createdAt}) 
      RETURNING id, role, content, createdAt
    ` as ChatMessage[];

    this.setState({ lastMessageTimestamp: Date.now() });
    
    return result;
  }

  async getHistory(): Promise<ChatMessage[]> {
    return await this.sql`SELECT id, role, content, createdAt FROM messages ORDER BY createdAt ASC` as ChatMessage[];
  }

  async onRequest(request: Request): Promise<Response> {
    try {
      if (request.method === "POST") {
        let body: { role?: string; content?: string };
        try {
          body = await request.json();
        } catch (error) {
          return new Response('Invalid JSON in request body', { status: 400 });
        }
        
        if (!body.role || !['user', 'assistant', 'system'].includes(body.role)) {
          return new Response('Missing or invalid "role" field. Must be "user", "assistant", or "system"', { status: 400 });
        }
        
        if (typeof body.content !== 'string' || body.content.trim().length === 0) {
          return new Response('Missing or invalid "content" field', { status: 400 });
        }
        
        if (body.content.length > 10000) {
          return new Response('Message content too long (max 10000 characters)', { status: 400 });
        }
        
        const message = await this.addMessage(body.role as 'user' | 'assistant' | 'system', body.content.trim());
        return Response.json(message);
      }
      
      if (request.method === "GET") {
        const history = await this.getHistory();
        return Response.json(history);
      }
      
      return new Response('Method not allowed', { status: 405 });
    } catch (error) {
      console.error(`ChatHistoryAgent error:`, error);
      return new Response('Internal server error', { status: 500 });
    }
  }
}