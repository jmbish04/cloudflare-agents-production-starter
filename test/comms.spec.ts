import { describe, it, expect, vi } from "vitest";

vi.mock('ai', () => ({
  streamText: vi.fn().mockResolvedValue({
    toTextStreamResponse: vi.fn().mockReturnValue(
      new Response("data: test stream\n\n", {
        headers: { "Content-Type": "text/event-stream" }
      })
    )
  })
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue({})
}));

describe("Communication Patterns", () => {
  describe("StreamingAgent SSE", () => {
    it("should create agent with mocked dependencies", async () => {
      const { StreamingAgent } = await import("../src/agents/StreamingAgent");
      const agent = new StreamingAgent({} as any, { OPENAI_API_KEY: "test-key" } as any);
      
      const mockRequest = new Request("http://example.com/test");
      const response = await agent.onRequest(mockRequest);
      
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });
  });
});