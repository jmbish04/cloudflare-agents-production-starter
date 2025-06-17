import { Agent } from "agents";
import { Connection } from "partyserver";
import type { WorkerEnv } from "../types";

interface CounterState {
  counter: number;
}

interface StateUpdateCommand {
  op: 'increment' | 'decrement';
  value?: number;
}

export class CounterAgent extends Agent<WorkerEnv, CounterState> {
  initialState = { counter: 0 };

  async onConnect(connection: Connection): Promise<void> {
    connection.send(JSON.stringify(this.state));
  }

  async onMessage(connection: Connection, message: string): Promise<void> {
    try {
      const command: StateUpdateCommand = JSON.parse(message);
      
      if (!command || typeof command.op !== 'string') {
        connection.send(JSON.stringify({ error: 'Invalid command structure' }));
        return;
      }
      
      if (command.value !== undefined && (typeof command.value !== 'number' || !isFinite(command.value))) {
        connection.send(JSON.stringify({ error: 'Invalid value: must be a finite number' }));
        return;
      }
      
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
        default:
          connection.send(JSON.stringify({ error: `Unknown command: ${command.op}` }));
          return;
      }
    } catch (error) {
      console.error('CounterAgent onMessage error:', error);
      connection.send(JSON.stringify({ error: 'Invalid command format' }));
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