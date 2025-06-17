import { describe, it, expect, vi, afterEach } from "vitest";
import { LoggingAgent } from "../src/agents/LoggingAgent";
import type { WorkerEnv } from "../src/types";

// Mock the agents module
vi.mock('agents', () => ({
  Agent: class MockAgent {
    name = 'test-log-id';
    constructor(public env: any, name: string) {
      this.name = name;
    }
  }
}));

describe("LoggingAgent: Structured Log Verification", () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  afterEach(() => logSpy.mockClear());

  it("should emit a valid structured JSON log on error", async () => {
    const mockEnv = {} as WorkerEnv;
    const agent = new LoggingAgent(mockEnv, 'test-log-id');
    
    const mockRequest = new Request("http://example.com/agent/logging/test-log-id", {
      method: "GET"
    });

    await agent.onRequest(mockRequest);

    expect(logSpy).toHaveBeenCalledTimes(2);

    // Check the info log (first call)
    const infoLogCall = logSpy.mock.calls[0][0];
    const infoLogObject = JSON.parse(infoLogCall);

    expect(infoLogObject).toMatchObject({
      level: "info",
      agentClass: "LoggingAgent",
      agentId: "test-log-id",
      eventType: "request.received",
      message: "Handling incoming request.",
    });
    expect(infoLogObject.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(infoLogObject.traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(infoLogObject.data).toEqual({ path: "/agent/logging/test-log-id", method: "GET" });

    // Check the error log (second call)
    const errorLogCall = logSpy.mock.calls[1][0];
    const errorLogObject = JSON.parse(errorLogCall);

    expect(errorLogObject).toMatchObject({
      level: "error",
      agentClass: "LoggingAgent",
      agentId: "test-log-id",
      eventType: "operation.failed",
      message: "An internal error occurred.",
    });
    expect(errorLogObject.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(errorLogObject.traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(errorLogObject.data).toHaveProperty("error", "Simulating an internal failure.");
    expect(errorLogObject.data).toHaveProperty("stack");
  });
});