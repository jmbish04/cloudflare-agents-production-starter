import { Agent } from "agents";
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

interface Env {
  OPENAI_API_KEY: string;
}

export class StreamingAgent extends Agent<Env> {
  async onRequest(request: Request) {
    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const result = await streamText({
      model: openai('gpt-4o'),
      prompt: 'Tell me a short story.',
    });
    
    return result.toTextStreamResponse();
  }
}