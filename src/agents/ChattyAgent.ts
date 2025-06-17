import { Agent, Connection } from "agents";

interface ConnState { 
  nickname: string; 
}

export class ChattyAgent extends Agent {
  async onMessage(connection: Connection<ConnState>, message: string) {
    try {
      const msg = JSON.parse(message);

      if (msg.op === 'set_nick') {
        connection.setState({ nickname: msg.nick });
        connection.send(`Nickname set to ${msg.nick}`);
      } else if (msg.op === 'send_text') {
        const sender = connection.state?.nickname || 'Anonymous';
        this.broadcast(`${sender}: ${msg.text}`);
      }
    } catch (e) {
      console.error('Failed to parse command:', e);
    }
  }
}