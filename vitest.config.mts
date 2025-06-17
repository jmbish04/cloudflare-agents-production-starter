import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          durableObjects: {
            COUNTER_AGENT: 'CounterAgent',
            GITHUB_AGENT: 'GitHubAgent',
            BROWSER_AGENT: 'WebBrowserAgent',
            LOGGING_AGENT: 'LoggingAgent',
          },
          bindings: {
            GITHUB_API_TOKEN: 'test-secret-token',
          },
        },
      },
    },
  },
});