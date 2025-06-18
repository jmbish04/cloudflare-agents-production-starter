import { Agent } from "agents";
import { Connection } from "partyserver";
import type { WorkerEnv } from "../types";

interface ConnState { 
  nickname: string; 
}

export class ChattyAgent extends Agent<WorkerEnv, {}> {
  private connections = new Set<Connection<ConnState>>();

  async onConnect(connection: Connection<ConnState>) {
    this.connections.add(connection);
  }

  async onClose(connection: Connection<ConnState>) {
    this.connections.delete(connection);
  }

  async onMessage(connection: Connection<ConnState>, message: string) {
    try {
      const msg = JSON.parse(message);

      if (msg.op === 'set_nick') {
        connection.setState({ nickname: msg.nick });
        connection.send(`Nickname set to ${msg.nick}`);
      } else if (msg.op === 'send_text') {
        const sender = connection.state?.nickname || 'Anonymous';
        const broadcastMessage = `${sender}: ${msg.text}`;
        console.log(`Broadcasting message: ${broadcastMessage}`);
        
        // Broadcast to all connections
        for (const conn of this.connections) {
          try {
            conn.send(broadcastMessage);
          } catch (error) {
            console.error(`Failed to send to connection ${conn.id}:`, error);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse command:', e);
    }
  }
}