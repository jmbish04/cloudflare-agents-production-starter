/**
 * Simple MCP tool that echoes a greeting. Designed to run in the
 * Cloudflare Worker environment without any Node.js dependencies.
 * Using a tiny function keeps execution fast on the edge.
 */
export function runMcpTool(name: string): string {
  return `Hello, ${name}!`;
}

