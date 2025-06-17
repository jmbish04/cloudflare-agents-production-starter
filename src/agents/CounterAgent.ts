import { Agent } from "agents";
import { Connection } from "partyserver";
import { z } from "zod";
import type { WorkerEnv } from "../types";

interface CounterState {
  counter: number;
}

interface StateUpdateCommand {
  op: 'increment' | 'decrement';
  value?: number;
}

const StateUpdateCommandSchema = z.object({
  op: z.enum(['increment', 'decrement']),
  value: z.number().finite().optional()
});

export class CounterAgent extends Agent<WorkerEnv, CounterState> {
  initialState = { counter: 0 };

  async onConnect(connection: Connection): Promise<void> {
    connection.send(JSON.stringify(this.state));
  }

  async onMessage(connection: Connection, message: string): Promise<void> {
    let parsedMessage;
    
    try {
      parsedMessage = JSON.parse(message);
    } catch (error) {
      console.error('CounterAgent onMessage error:', error);
      connection.send(JSON.stringify({ error: 'Invalid JSON format' }));
      return;
    }
    
    const validationResult = StateUpdateCommandSchema.safeParse(parsedMessage);
    
    if (!validationResult.success) {
      connection.send(JSON.stringify({ 
        error: 'Invalid command format',
        details: validationResult.error.errors
      }));
      return;
    }
    
    const command = validationResult.data;
    const value = command.value || 1;
    
    switch (command.op) {
      case 'increment':
        const newIncrementValue = this.state.counter + value;
        if (newIncrementValue > Number.MAX_SAFE_INTEGER) {
          connection.send(JSON.stringify({ error: 'Counter would exceed maximum safe integer' }));
          return;
        }
        this.setState({ counter: newIncrementValue });
        break;
      case 'decrement':
        const newDecrementValue = this.state.counter - value;
        if (newDecrementValue < Number.MIN_SAFE_INTEGER) {
          connection.send(JSON.stringify({ error: 'Counter would go below minimum safe integer' }));
          return;
        }
        this.setState({ counter: newDecrementValue });
        break;
    }
  }

  async increment(): Promise<void> {
    this.setState({ counter: this.state.counter + 1 });
  }

  onStateUpdate(newState: CounterState, source: "server" | Connection): void {
    const sourceId = source === "server" ? "server" : source.id;
    console.log(`State updated to ${newState.counter} by ${sourceId}`);
  }

  async getState(): Promise<CounterState> {
    return this.state;
  }

  async onRequest(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const action = pathParts[pathParts.length - 1]; // Last segment is the action

      if (request.method === 'POST' && action === 'increment') {
        await this.increment();
        return new Response(JSON.stringify(this.state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'GET' && (action === 'state' || pathParts.length === 4)) {
        // Handle both /agent/counter-agent/{id}/state and /agent/counter-agent/{id}
        const state = await this.getState();
        return new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('CounterAgent onRequest error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }
}