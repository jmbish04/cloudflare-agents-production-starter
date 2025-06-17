import { Agent, Connection } from "agents";

interface HITLState {
  status: "idle" | "pending_review" | "running" | "aborted" | "completed";
  data: any;
}

interface HITLInterventionCommand {
  op: "proceed" | "override" | "abort";
  newData?: any;
}

export class HITLAgent extends Agent<any, HITLState> {
  initialState: HITLState = { status: "idle", data: null };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === "POST" && url.pathname.endsWith("/execute-transaction")) {
      try {
        const { data } = await request.json();
        return await this.executeTransaction(data);
      } catch (error) {
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    return new Response("Not found", { status: 404 });
  }

  async executeTransaction(data: any): Promise<Response> {
    // Pause workflow
    this.setState({ status: "pending_review", data });

    // Generate a unique URL for the intervention UI
    const interventionUrl = `https://${this.env.DOMAIN || 'localhost'}/intervention?agentId=${this.name}`;
    console.log(`NEEDS REVIEW: ${interventionUrl}`); // In reality, send to Slack/email

    return new Response(
      JSON.stringify({
        message: "Awaiting human approval.",
        interventionUrl
      }),
      { 
        status: 202,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  async onConnect(connection: Connection): Promise<void> {
    // Send current state to newly connected intervention UI
    connection.send(JSON.stringify({ 
      type: "state_update", 
      state: this.state 
    }));
  }

  async onMessage(connection: Connection, message: string): Promise<void> {
    try {
      const command: HITLInterventionCommand = JSON.parse(message);
      
      if (this.state.status !== "pending_review") {
        connection.send(JSON.stringify({ 
          type: "error", 
          message: "Agent is not in pending review state" 
        }));
        return;
      }

      switch (command.op) {
        case "proceed":
          this.setState({ ...this.state, status: "running" });
          await this.continueOriginalTask();
          this.setState({ ...this.state, status: "completed" });
          break;
        
        case "override":
          this.setState({ status: "running", data: command.newData });
          await this.continueOriginalTask();
          this.setState({ ...this.state, status: "completed" });
          break;
        
        case "abort":
          this.setState({ ...this.state, status: "aborted" });
          break;
        
        default:
          connection.send(JSON.stringify({ 
            type: "error", 
            message: "Invalid command operation" 
          }));
          return;
      }

      // Broadcast state update to all connected clients
      this.broadcast(JSON.stringify({ 
        type: "state_update", 
        state: this.state 
      }));
    } catch (error) {
      connection.send(JSON.stringify({ 
        type: "error", 
        message: "Invalid command format" 
      }));
    }
  }

  private async continueOriginalTask(): Promise<void> {
    // Placeholder for the actual task logic
    // In a real implementation, this would contain the business logic
    // that was paused for human review
    console.log("Continuing original task with data:", this.state.data);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}