# Pitfall Report: Vitest Mock Variable Hoisting Issue

**ID**: 001-vitest-mock-hoisting
**Date**: 2025-06-17
**Severity**: High - Blocks test execution

## Problem Description

When using `vi.mock()` with external variables in vitest, the mock factory function cannot access variables declared outside due to JavaScript hoisting behavior.

## Exact Command Run

```bash
npm test
```

## Full Unexpected Output

```
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/agents/SupervisorAgent.test.ts [ src/agents/SupervisorAgent.test.ts ]
Error: [vitest] There was an error when mocking a module. If you are using "vi.mock" factory, make sure there are no top level variables inside, since this call is hoisted to top of the file. Read more: https://vitest.dev/api/vi.html#vi-mock
 ❯ src/agents/SupervisorAgent.ts:1:31
      1| import { Agent, getAgentByName } from "agents";
       |                               ^
      2| import type { WorkerEnv } from "../types";
      3| import type { WorkerAgent } from "./WorkerAgent";

Caused by: ReferenceError: Cannot access 'mockGetAgentByName' before initialization
 ❯ src/agents/SupervisorAgent.test.ts:11:19
 ❯ src/agents/SupervisorAgent.ts:1:31
```

## Problematic Code Pattern

```typescript
// ❌ WRONG - This fails due to hoisting
const mockWorkerAgent = {
  scrape: vi.fn().mockResolvedValue(undefined),
};

const mockGetAgentByName = vi.fn().mockResolvedValue(mockWorkerAgent);

vi.mock('agents', () => ({
  Agent: class MockAgent { /* ... */ },
  getAgentByName: mockGetAgentByName, // ❌ ReferenceError here
}));
```

## Corrected Command/Workaround

Move all variable declarations inside the `vi.mock()` factory function:

```typescript
// ✅ CORRECT - All variables inside mock factory
vi.mock('agents', () => {
  const mockWorkerAgent = {
    scrape: vi.fn().mockResolvedValue(undefined),
  };

  const mockGetAgentByName = vi.fn().mockResolvedValue(mockWorkerAgent);

  class TestAgent {
    public name: string = 'test-agent';
    public env: any = {};
    constructor(name?: string) {
      if (name) this.name = name;
    }
  }

  return {
    Agent: TestAgent,
    getAgentByName: mockGetAgentByName,
  };
});

// Then use vi.mocked() to access the mock
import { getAgentByName } from 'agents';
const mockedGetAgentByName = vi.mocked(getAgentByName);
```

## Alternative Workaround

Use `vi.mocked()` with runtime setup:

```typescript
vi.mock('agents', () => ({
  Agent: TestAgent,
  getAgentByName: vi.fn(),
}));

// Setup mock behavior in beforeEach
beforeEach(() => {
  const mockWorkerAgent = { scrape: vi.fn().mockResolvedValue(undefined) };
  mockedGetAgentByName.mockResolvedValue(mockWorkerAgent);
});
```

## Root Cause

Vitest hoists `vi.mock()` calls to the top of the file before variable declarations are processed, causing reference errors when external variables are used in mock factories.

## Prevention

Always declare all mock dependencies inside the `vi.mock()` factory function or use `vi.mocked()` with runtime configuration in test setup hooks.