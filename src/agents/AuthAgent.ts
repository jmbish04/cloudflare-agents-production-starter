import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export class AuthAgent extends Agent<WorkerEnv> {
  async onConnect(connection: any) {
    connection.send("Welcome to the secure connection!");
  }

  async onMessage(connection: any, message: string) {
    try {
      const data = JSON.parse(message);
      connection.send(`Secure echo: ${JSON.stringify(data)}`);
    } catch (e) {
      connection.send("Invalid JSON");
    }
  }

  async connect(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    server.accept();
    
    const connection = {
      id: `conn-${Date.now()}`,
      send: (message: string) => server.send(message),
      close: () => server.close(),
      setState: (state: any) => { (connection as any).state = state; },
      state: null
    };
    
    server.addEventListener('message', async (event) => {
      try {
        await this.onMessage(connection as any, event.data as string);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    server.addEventListener('close', async (event) => {
      try {
        await (this as any).onClose?.(connection, event.code || 1000, event.reason || '', event.wasClean || true);
      } catch (error) {
        console.error('WebSocket close error:', error);
      }
    });
    
    try {
      await this.onConnect(connection as any);
    } catch (error) {
      console.error('WebSocket connect error:', error);
    }
    
    return new Response(null, { status: 101, webSocket: client });
  }
}