import { useAgent } from "agents/react";
import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "../agents/ChatHistoryAgent";

interface UseAgentChatOptions {
  agent: string;
  name: string;
}

interface UseAgentChatReturn {
  messages: ChatMessage[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
}

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [agentState, setAgentState] = useState<{ lastMessageTimestamp: number }>({ 
    lastMessageTimestamp: 0 
  });

  const agent = useAgent({
    agent: options.agent,
    name: options.name,
    onStateUpdate: setAgentState,
  });

  const fetchHistory = useCallback(async () => {
    if (!agent) return;
    
    try {
      setIsLoading(true);
      const history = await agent.getHistory();
      setMessages(history || []);
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, agentState.lastMessageTimestamp]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!agent || !input.trim()) return;

    try {
      await agent.addMessage('user', input.trim());
      setInput("");
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [agent, input]);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
  };
}