# Pitfall Report: Agent Mock Missing SQL and State Methods

## Problem
When adding SQL and state management to Agent classes, unit tests fail with "this.sql is not a function" or "this.setState is not a function" errors.

## Root Cause
The mocked Agent class in test files lacks the `sql` method and `setState` method that are available in the real Agent runtime.

## Failed Command/Code
```typescript
// This fails in tests:
(this as any).sql`CREATE TABLE IF NOT EXISTS config (key TEXT, value TEXT)`;
this.setState({ config });
```

## Error Output
```
TypeError: this.sql is not a function
 ❯ MyAgent.onStart src/agents/MyAgent.ts:30:19
```

## Solution
Enhance the Agent mock to include SQL and state methods:

```typescript
vi.mock('agents', () => {
  class TestAgent {
    public name: string = 'test-agent';
    public env: any = {};
    public state: any = {};
    
    constructor(name?: string) {
      if (name) this.name = name;
    }
    
    sql(strings: TemplateStringsArray, ...values: any[]) {
      // Mock SQL execution - just return empty array
      return [];
    }
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
  }
  return { Agent: TestAgent };
});
```

## Prevention
Always update Agent mocks when adding new Agent capabilities. The mock should mirror the real Agent interface for methods used in production code.

## Lesson
Agent mocks in tests must be kept in sync with production Agent functionality, especially for core methods like `sql` and `setState`.