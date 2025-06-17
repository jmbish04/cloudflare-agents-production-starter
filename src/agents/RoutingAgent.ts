import { Agent, Connection } from 'agents';
import type { WorkerEnv } from '../types';

interface RoutingState {
  connectionCount: number;
}

interface IntentClassification {
  intent: 'get_weather' | 'complex_reasoning' | 'unknown';
  entities: {
    location?: string;
    original_prompt: string;
  };
}

export class RoutingAgent extends Agent<WorkerEnv, RoutingState> {
  constructor(state: DurableObjectState, env: WorkerEnv) {
    super(state, env);
    this.setState({ connectionCount: 0 });
  }

  async onConnect(connection: Connection) {
    const newCount = this.state.connectionCount + 1;
    this.setState({ connectionCount: newCount });
    connection.send('Connected to RoutingAgent. Send your query to get routed to the appropriate service.');
  }

  async onClose(connection: Connection) {
    const newCount = Math.max(0, this.state.connectionCount - 1);
    this.setState({ connectionCount: newCount });
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const userPrompt = message.trim();
      
      if (!userPrompt) {
        connection.send('Error: Empty query received');
        return;
      }

      const classification = await this.classifyIntent(userPrompt);
      
      if (classification.intent === 'get_weather') {
        const weather = await this.getWeather(classification.entities.location);
        connection.send(weather);
      } else if (classification.intent === 'complex_reasoning') {
        const result = await this.callReasoningModel(userPrompt);
        connection.send(result);
      } else {
        connection.send('I\'m not sure how to help with that. Please try asking about the weather or a more complex question.');
      }
    } catch (error) {
      connection.send('Error: Failed to process your request');
      console.error('RoutingAgent error:', error);
    }
  }

  private async classifyIntent(prompt: string): Promise<IntentClassification> {
    try {
      const classificationPrompt = `
Classify the following user prompt into one of these intents:
- "get_weather": if the user is asking about weather, temperature, or climate
- "complex_reasoning": if the user is asking for analysis, explanations, or complex tasks
- "unknown": if unclear or doesn't fit the above

If the intent is "get_weather", extract the location if mentioned.

User prompt: "${prompt}"

Respond with JSON in this format:
{
  "intent": "get_weather" | "complex_reasoning" | "unknown",
  "entities": {
    "location": "extracted location or null",
    "original_prompt": "${prompt}"
  }
}`;

      const response = await this.env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
        prompt: classificationPrompt,
        max_tokens: 100
      });

      try {
        const parsed = JSON.parse(response.response);
        return {
          intent: parsed.intent || 'unknown',
          entities: {
            location: parsed.entities?.location || null,
            original_prompt: prompt
          }
        };
      } catch (parseError) {
        return this.fallbackClassification(prompt);
      }
    } catch (error) {
      return this.fallbackClassification(prompt);
    }
  }

  private fallbackClassification(prompt: string): IntentClassification {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('weather') || lowerPrompt.includes('temperature') || lowerPrompt.includes('climate')) {
      const locationMatch = prompt.match(/(?:in|for|at)\s+([a-zA-Z\s]+)/i);
      return {
        intent: 'get_weather',
        entities: {
          location: locationMatch?.[1]?.trim() || null,
          original_prompt: prompt
        }
      };
    }
    
    if (prompt.length > 50 || lowerPrompt.includes('explain') || lowerPrompt.includes('analyze') || lowerPrompt.includes('why') || lowerPrompt.includes('how')) {
      return {
        intent: 'complex_reasoning',
        entities: {
          original_prompt: prompt
        }
      };
    }
    
    return {
      intent: 'unknown',
      entities: {
        original_prompt: prompt
      }
    };
  }

  private async getWeather(location?: string): Promise<string> {
    const place = location || 'your location';
    const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy', 'clear'];
    const temps = [18, 22, 25, 28, 32];
    
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const temp = temps[Math.floor(Math.random() * temps.length)];
    
    return `Current weather in ${place}: ${condition}, ${temp}°C. This is a simulated weather response for demonstration purposes.`;
  }

  private async callReasoningModel(prompt: string): Promise<string> {
    try {
      const aiGatewayUrl = `https://gateway.ai.cloudflare.com/v1/${this.env.OPENAI_API_KEY}/openai`;
      
      const response = await fetch(`${aiGatewayUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful AI assistant. Provide thoughtful and detailed responses.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`AI Gateway request failed: ${response.status}`);
      }

      const result = await response.json();
      return result.choices?.[0]?.message?.content || 'I apologize, but I couldn\'t process that request at the moment.';
    } catch (error) {
      console.error('Reasoning model error:', error);
      return 'I encountered an error while processing your complex request. Please try again later.';
    }
  }

  async onRequest(request: Request): Promise<Response> {
    return new Response(JSON.stringify({ 
      message: 'RoutingAgent operates via WebSocket connections only',
      connectionCount: this.state.connectionCount
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}