import { describe, it, expect, vi } from "vitest";
import { CounterAgent } from "../src/agents/CounterAgent";
import type { WorkerEnv } from "../src/types";

// Mock the agents module
vi.mock('agents', () => ({
  Agent: class MockAgent {
    state = { counter: 0 };
    setState(newState: any) { this.state = { ...this.state, ...newState }; }
  }
}));

describe("CounterAgent: Stateful Interaction", () => {
  it("should increment and persist state across multiple requests", async () => {
    const mockEnv = {} as WorkerEnv;
    const agent = new CounterAgent(mockEnv, 'test-counter-agent');

    // First increment should set counter to 1
    const state1 = await agent.increment();
    expect(state1.counter).toBe(1);

    // Second increment should set counter to 2
    const state2 = await agent.increment();
    expect(state2.counter).toBe(2);

    // Third increment to verify persistence
    const state3 = await agent.increment();
    expect(state3.counter).toBe(3);

    // Verify getState returns current state
    const currentState = await agent.getState();
    expect(currentState.counter).toBe(3);
  });
});