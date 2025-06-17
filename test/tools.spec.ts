import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import app from '../src/index';

const server = setupServer(
  http.get('https://api.github.com/repos/cloudflare/workers-sdk', () => {
    return HttpResponse.json({
      name: 'workers-sdk',
      full_name: 'cloudflare/workers-sdk',
      description: 'A collection of APIs and tools to develop applications for Cloudflare Workers.',
      stargazers_count: 2500,
      open_issues_count: 42,
      html_url: 'https://github.com/cloudflare/workers-sdk'
    });
  }),
  http.get('https://api.github.com/repos/invalid/repo', () => {
    return new HttpResponse(null, { status: 404 });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => server.resetHandlers());

// Mock agents module
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-agent';
    public env: any = { GITHUB_API_TOKEN: 'test-token' };
    
    constructor(name?: string) {
      if (name) this.name = name;
    }
  }
  
  return {
    Agent: TestAgent,
    getAgentByName: vi.fn().mockImplementation((binding: any, id: string) => {
      if (id === 'singleton-gh-tool') {
        return {
          getRepo: vi.fn().mockImplementation(async (repoName: string) => {
            if (repoName === 'cloudflare/workers-sdk') {
              return {
                name: 'workers-sdk',
                full_name: 'cloudflare/workers-sdk',
                description: 'A collection of APIs and tools to develop applications for Cloudflare Workers.',
                stargazers_count: 2500,
                open_issues_count: 42,
                url: 'https://github.com/cloudflare/workers-sdk'
              };
            }
            return null;
          })
        };
      }
      if (id.startsWith('browser-tool-for-')) {
        return {
          getPageTitle: vi.fn().mockResolvedValue(null)
        };
      }
      return {};
    })
  };
});

const mockEnv = {
  GITHUB_AGENT: {},
  BROWSER_AGENT: {},
  GITHUB_API_TOKEN: 'test-token'
} as any;

describe("GitHubAgent Tool", () => {
  it("returns GitHub repository data via tool endpoint", async () => {
    const req = new Request("http://localhost/tool/github/cloudflare/workers-sdk", { 
      method: 'POST' 
    });
    const res = await app.fetch(req, mockEnv);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data).toEqual({
      name: 'workers-sdk',
      full_name: 'cloudflare/workers-sdk',
      description: 'A collection of APIs and tools to develop applications for Cloudflare Workers.',
      stargazers_count: 2500,
      open_issues_count: 42,
      url: 'https://github.com/cloudflare/workers-sdk'
    });
  });

  it("handles invalid repository gracefully", async () => {
    const req = new Request("http://localhost/tool/github/invalid/repo", { 
      method: 'POST' 
    });
    const res = await app.fetch(req, mockEnv);
    const data = await res.json();
    
    expect(res.status).toBe(404);
    expect(data).toEqual({
      error: "Repository not found or API call failed."
    });
  });

  it("handles invalid repo format", async () => {
    const req = new Request("http://localhost/tool/github/invalid-format", { 
      method: 'POST' 
    });
    const res = await app.fetch(req, mockEnv);
    
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not Found');
  });
});

describe("WebBrowserAgent Tool", () => {
  it("returns error for browser tool when browser service unavailable", async () => {
    const req = new Request("http://localhost/tool/browser/title", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' })
    });
    const res = await app.fetch(req, mockEnv);
    const data = await res.json();
    
    expect(res.status).toBe(500);
    expect(data).toEqual({
      error: "Failed to retrieve page title."
    });
  });
});