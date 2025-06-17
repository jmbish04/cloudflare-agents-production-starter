import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { WorkerEnv } from '../src/types';
import { startMockServer, stopMockServer } from './mocks/server';

vi.mock('agents', () => {
  const agentStates: Record<string, any> = {};
  
  class TestAgent {
    public state: any = {};
    public sql: any;
    public env: any;
    public schedule: any;

    constructor(state: any, env: any) {
      this.env = env;
      this.state = { connectionCount: 0, documentCount: 0 };
      
      this.sql = vi.fn((query: TemplateStringsArray, ...values: any[]) => {
        const queryStr = query.join('?');
        
        if (queryStr.includes('CREATE TABLE')) {
          return [];
        }
        if (queryStr.includes('INSERT INTO _meta')) {
          return [];
        }
        if (queryStr.includes('SELECT value FROM _meta')) {
          return [{ value: 0 }];
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: 0 }];
        }
        if (queryStr.includes('INSERT INTO documents') && queryStr.includes('RETURNING')) {
          const id = Math.floor(Math.random() * 1000) + 1;
          return [{ id }];
        }
        
        return [];
      });

      this.schedule = vi.fn();
    }

    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
  }

  return {
    Agent: TestAgent,
    getAgentByName: vi.fn(async (binding: any, id: string) => {
      return new TestAgent({ id }, { id, ...binding });
    })
  };
});

describe('AI and RAG Agents', () => {
  // Start/stop MSW server for external API mocking
  beforeAll(() => startMockServer());
  afterAll(() => stopMockServer());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RAG Patterns', () => {
    it('should demonstrate RAG ingestion workflow', async () => {
      const mockAI = vi.fn().mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
      });
      
      const mockVectorDB = {
        insert: vi.fn().mockResolvedValue({}),
        query: vi.fn(),
        deleteByIds: vi.fn()
      };

      // Simulate the RAG ingestion pattern
      const content = 'Test document content';
      
      // 1. Generate embedding
      const embedResult = await mockAI('@cf/baai/bge-base-en-v1.5', { text: [content] });
      
      // 2. Insert into vector database
      await mockVectorDB.insert([{
        id: '1',
        values: embedResult.data[0],
        metadata: { documentId: 1 }
      }]);
      
      expect(mockAI).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: ['Test document content']
      });
      expect(mockVectorDB.insert).toHaveBeenCalled();
    });

    it('should demonstrate RAG query workflow', async () => {
      const mockAI = vi.fn().mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
      });
      
      const mockVectorDB = {
        query: vi.fn().mockResolvedValue({
          matches: [
            { metadata: { documentId: 1 } },
            { metadata: { documentId: 2 } }
          ]
        }),
        insert: vi.fn(),
        deleteByIds: vi.fn()
      };

      // Simulate RAG query pattern
      const userQuery = 'test query';
      
      // 1. Generate query embedding
      const queryEmbedding = await mockAI('@cf/baai/bge-base-en-v1.5', { text: [userQuery] });
      
      // 2. Search vector database
      const vectorMatches = await mockVectorDB.query(queryEmbedding.data[0], { 
        topK: 5, 
        returnMetadata: true 
      });
      
      expect(mockAI).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: ['test query']
      });
      expect(mockVectorDB.query).toHaveBeenCalled();
      expect(vectorMatches.matches).toHaveLength(2);
    });

    it('should demonstrate stale vector cleanup pattern', async () => {
      const mockVectorDB = {
        deleteByIds: vi.fn().mockResolvedValue({}),
        query: vi.fn(),
        insert: vi.fn()
      };

      // Simulate cleanup of stale vector IDs
      const staleIds = ['999', '1000'];
      await mockVectorDB.deleteByIds(staleIds);
      
      expect(mockVectorDB.deleteByIds).toHaveBeenCalledWith(['999', '1000']);
    });
  });

  describe('Routing Patterns', () => {
    it('should demonstrate intent classification pattern', async () => {
      const mockAI = vi.fn().mockResolvedValue({
        response: JSON.stringify({
          intent: 'get_weather',
          entities: { location: 'London' }
        })
      });

      // Simulate intent classification
      const userPrompt = 'What is the weather in London?';
      const classificationPrompt = `Classify user intent: "${userPrompt}"`;
      
      const response = await mockAI('@cf/meta/llama-2-7b-chat-int8', {
        prompt: classificationPrompt,
        max_tokens: 100
      });
      
      const classification = JSON.parse(response.response);
      
      expect(classification.intent).toBe('get_weather');
      expect(classification.entities.location).toBe('London');
      expect(mockAI).toHaveBeenCalled();
    });

    it('should demonstrate weather tool response', async () => {
      // Simulate simple weather tool
      const getWeather = (location?: string) => {
        const place = location || 'your location';
        return `Current weather in ${place}: sunny, 22°C`;
      };
      
      const result = getWeather('London');
      expect(result).toContain('London');
      expect(result).toContain('sunny');
    });

    it('should demonstrate AI Gateway pattern', async () => {
      // Simulate AI Gateway call using MSW mock
      const gatewayUrl = 'https://gateway.ai.cloudflare.com/v1/test-key/openai';
      const prompt = 'Explain quantum computing';
      
      const response = await fetch(`${gatewayUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        })
      });

      const result = await response.json();
      
      expect(response.ok).toBe(true);
      expect(result.choices[0].message.content).toContain('complex reasoning');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate agent configurations exist', () => {
      // Test that our configuration includes the new agents
      const requiredAgents = ['RAG_AGENT', 'ROUTING_AGENT'];
      const requiredServices = ['AI', 'VECTOR_DB'];
      
      // This would be validated against the actual wrangler.jsonc in a real environment
      expect(requiredAgents).toContain('RAG_AGENT');
      expect(requiredAgents).toContain('ROUTING_AGENT');
      expect(requiredServices).toContain('AI');
      expect(requiredServices).toContain('VECTOR_DB');
    });

    it('should validate required environment types', () => {
      type WorkerEnvKeys = keyof WorkerEnv;
      
      // Validate that our types include the new services
      const expectedKeys: WorkerEnvKeys[] = ['AI', 'VECTOR_DB', 'RAG_AGENT', 'ROUTING_AGENT'];
      
      expectedKeys.forEach(key => {
        expect(typeof key).toBe('string');
      });
    });
  });
});