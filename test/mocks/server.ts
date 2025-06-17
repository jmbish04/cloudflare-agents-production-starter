import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Common mock handlers for external APIs
export const handlers = [
  // GitHub API mock
  http.get('https://api.github.com/repos/cloudflare/workers-sdk', () => {
    return HttpResponse.json({ 
      name: 'workers-sdk',
      full_name: 'cloudflare/workers-sdk',
      description: 'Mocked workers-sdk repo',
      stargazers_count: 999,
      open_issues_count: 42,
      url: 'https://github.com/cloudflare/workers-sdk'
    });
  }),

  // AI Gateway mock
  http.post('https://gateway.ai.cloudflare.com/v1/*/openai/chat/completions', () => {
    return HttpResponse.json({
      choices: [{
        message: {
          content: 'This is a complex reasoning response'
        }
      }]
    });
  }),

  // Generic GitHub API pattern for any repo
  http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
    return HttpResponse.json({
      name: params.repo,
      full_name: `${params.owner}/${params.repo}`,
      description: `Mocked ${params.repo} repository`,
      stargazers_count: 100,
      open_issues_count: 5,
      url: `https://github.com/${params.owner}/${params.repo}`
    });
  }),
];

// Create and export the server instance
export const server = setupServer(...handlers);

// Helper functions for tests
export const startMockServer = () => server.listen();
export const stopMockServer = () => server.close();
export const resetMockHandlers = () => server.resetHandlers();