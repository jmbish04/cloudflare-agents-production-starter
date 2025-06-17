#!/usr/bin/env node

// Manual verification script for Cloudflare Agents Real-time Communication Layer
// This verifies the implementation without import issues

import fs from 'fs';
import path from 'path';

const checks = {
  passed: 0,
  failed: 0,
  results: []
};

function check(name, condition, description) {
  const result = {
    name,
    passed: condition,
    description
  };
  
  checks.results.push(result);
  
  if (condition) {
    checks.passed++;
    console.log(`✅ [CONFIG] ${name}: ${description}`);
  } else {
    checks.failed++;
    console.log(`❌ [CONFIG] ${name}: ${description}`);
  }
}

// Read configuration files
const wranglerConfig = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
const indexContent = fs.readFileSync('src/index.ts', 'utf8');
const echoAgentContent = fs.readFileSync('src/agents/EchoAgent.ts', 'utf8');
const streamingAgentContent = fs.readFileSync('src/agents/StreamingAgent.ts', 'utf8');
const counterAgentContent = fs.readFileSync('src/agents/CounterAgent.ts', 'utf8');
const chattyAgentContent = fs.readFileSync('src/agents/ChattyAgent.ts', 'utf8');

console.log('🔍 Verifying Cloudflare Agents Real-time Communication Layer\\n');

// Check wrangler.jsonc configuration
check(
  'Durable Objects Bindings Exist',
  wranglerConfig.durable_objects && wranglerConfig.durable_objects.bindings,
  'wrangler.jsonc contains durable_objects.bindings array'
);

check(
  'COUNTER_AGENT Binding',
  wranglerConfig.durable_objects.bindings.some(b => b.name === 'COUNTER_AGENT' && b.class_name === 'CounterAgent'),
  'COUNTER_AGENT binding with CounterAgent class exists'
);

check(
  'ECHO_AGENT Binding',
  wranglerConfig.durable_objects.bindings.some(b => b.name === 'ECHO_AGENT' && b.class_name === 'EchoAgent'),
  'ECHO_AGENT binding with EchoAgent class exists'
);

check(
  'STREAMING_AGENT Binding',
  wranglerConfig.durable_objects.bindings.some(b => b.name === 'STREAMING_AGENT' && b.class_name === 'StreamingAgent'),
  'STREAMING_AGENT binding with StreamingAgent class exists'
);

check(
  'CHATTY_AGENT Binding',
  wranglerConfig.durable_objects.bindings.some(b => b.name === 'CHATTY_AGENT' && b.class_name === 'ChattyAgent'),
  'CHATTY_AGENT binding with ChattyAgent class exists'
);

check(
  'Migration with All Agents',
  wranglerConfig.migrations.some(m => 
    m.new_sqlite_classes && 
    ['CounterAgent', 'EchoAgent', 'StreamingAgent', 'ChattyAgent'].every(agent => 
      wranglerConfig.migrations.some(migration => 
        migration.new_sqlite_classes && migration.new_sqlite_classes.includes(agent)
      )
    )
  ),
  'All required agents are in migrations new_sqlite_classes'
);

// Check index.ts exports
check(
  'CounterAgent Export',
  indexContent.includes('export { CounterAgent }'),
  'CounterAgent is exported from index.ts'
);

check(
  'EchoAgent Export',
  indexContent.includes('export { EchoAgent }'),
  'EchoAgent is exported from index.ts'
);

check(
  'StreamingAgent Export',
  indexContent.includes('export { StreamingAgent }'),
  'StreamingAgent is exported from index.ts'
);

check(
  'ChattyAgent Export',
  indexContent.includes('export { ChattyAgent }'),
  'ChattyAgent is exported from index.ts'
);

// Check WebSocket routing
check(
  'EchoAgent WebSocket Route',
  indexContent.includes("/echo-agent/") && indexContent.includes("request.headers.get('upgrade') === 'websocket'"),
  'EchoAgent WebSocket route exists in fetch handler'
);

check(
  'CounterAgent WebSocket Route',
  indexContent.includes("/counter-agent/") && indexContent.includes("request.headers.get('upgrade') === 'websocket'"),
  'CounterAgent WebSocket route exists in fetch handler'
);

check(
  'ChattyAgent WebSocket Route',
  indexContent.includes("/chatty-agent/") && indexContent.includes("request.headers.get('upgrade') === 'websocket'"),
  'ChattyAgent WebSocket route exists in fetch handler'
);

check(
  'StreamingAgent HTTP Route',
  indexContent.includes("/streaming-agent/") && indexContent.includes('agent.onRequest(request)'),
  'StreamingAgent HTTP route exists in fetch handler'
);

// Check Agent implementations
check(
  'EchoAgent onConnect Implementation',
  echoAgentContent.includes('onConnect') && echoAgentContent.includes('Welcome!'),
  'EchoAgent sends Welcome! message on connect'
);

check(
  'EchoAgent onMessage Implementation',
  echoAgentContent.includes('onMessage') && echoAgentContent.includes('You said:'),
  'EchoAgent echoes messages with "You said:" prefix'
);

check(
  'StreamingAgent SSE Implementation',
  streamingAgentContent.includes('toTextStreamResponse'),
  'StreamingAgent returns streaming response'
);

check(
  'CounterAgent Command Pattern',
  counterAgentContent.includes('JSON.parse') && counterAgentContent.includes('op'),
  'CounterAgent implements command pattern with JSON parsing'
);

check(
  'ChattyAgent Connection State',
  chattyAgentContent.includes('setState') && chattyAgentContent.includes('nickname'),
  'ChattyAgent implements connection-specific state'
);

// Summary
console.log(`\\n📊 Verification Summary:`);
console.log(`   ✅ Passed: ${checks.passed}`);
console.log(`   ❌ Failed: ${checks.failed}`);
console.log(`   📋 Total:  ${checks.results.length}`);

if (checks.failed === 0) {
  console.log(`\\n🎉 All configuration checks PASSED! Core implementation is ready for verification.`);
  process.exit(0);
} else {
  console.log(`\\n⚠️  ${checks.failed} configuration issues need to be resolved.`);
  process.exit(1);
}