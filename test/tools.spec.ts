import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { GitHubAgent } from "../src/agents/GitHubAgent";
import type { WorkerEnv } from "../src/types";
import { startMockServer, stopMockServer } from "./mocks/server";

// Mock the agents module
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public env: any, name: string) {}
  }
}));

// Start/stop the server for the test suite
beforeAll(() => startMockServer());
afterAll(() => stopMockServer());

describe("GitHubAgent: Mocked External API", () => {
  it("should return mocked data instead of hitting live API", async () => {
    const mockEnv = {
      GITHUB_API_TOKEN: 'test-token'
    } as WorkerEnv;
    
    const agent = new GitHubAgent(mockEnv, 'test-github-agent');
    const data = await agent.getRepo('cloudflare/workers-sdk');
    
    expect(data).toBeTruthy();
    expect(data!.name).toBe('workers-sdk');
    expect(data!.stargazers_count).toBe(999);
    expect(data!.full_name).toBe('cloudflare/workers-sdk');
    expect(data!.description).toBe('Mocked workers-sdk repo');
  });
});