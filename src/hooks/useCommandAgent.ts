import { useAgent } from "agents/react";

interface CommandAgentConfig {
  agent: string;
  name: string;
  onStateUpdate?: (newState: any) => void;
}

interface CommandAgentAPI {
  sendCommand: (command: Record<string, any>) => void;
  call: (method: string, ...args: any[]) => Promise<any>;
  state: any;
}

export function useCommandAgent(config: CommandAgentConfig): CommandAgentAPI {
  const agent = useAgent(config);

  const sendCommand = (command: Record<string, any>) => {
    if (!command || typeof command !== 'object') {
      throw new Error('Command must be a valid object');
    }
    
    if (!command.op || typeof command.op !== 'string') {
      throw new Error('Command must have an "op" field of type string');
    }
    
    agent.send(JSON.stringify(command));
  };

  return {
    sendCommand,
    call: agent.call.bind(agent),
    state: agent.state
  };
}