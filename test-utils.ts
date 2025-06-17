import type { WorkerEnv } from './src/types';

// Test utilities for mocking Agent behavior
export class TestAgent {
  public name: string = 'test-agent';
  public env: WorkerEnv = {
    MY_AGENT: {} as any,
    SUPERVISOR: {} as any,
    WORKER: {} as any,
  };

  constructor(name?: string) {
    if (name) this.name = name;
  }
}