import { runMcpTool } from '../../src/mcp-tool';
import { describe, it, expect } from 'vitest';

describe('MCP tool', () => {
  it('returns a greeting', () => {
    expect(runMcpTool('World')).toBe('Hello, World!');
  });
});

