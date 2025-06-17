#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'src', 'agents');
const WRANGLER_CONFIG = path.join(__dirname, '..', 'wrangler.jsonc');
const TYPES_FILE = path.join(__dirname, '..', 'src', 'types.ts');
const INDEX_FILE = path.join(__dirname, '..', 'src', 'index.ts');

function scanAgents() {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map(file => file.replace('.ts', ''));
  
  return agentFiles.map(name => ({
    className: name,
    bindingName: name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
    fileName: name
  }));
}

function updateWranglerConfig(agents) {
  const config = JSON.parse(fs.readFileSync(WRANGLER_CONFIG, 'utf8'));
  
  config.durable_objects.bindings = agents.map(agent => ({
    name: agent.bindingName,
    class_name: agent.className
  }));
  
  // Group agents by migration tag based on creation order
  const migrationsMap = {};
  agents.forEach((agent, index) => {
    const tag = `v${Math.floor(index / 3) + 1}`;
    if (!migrationsMap[tag]) migrationsMap[tag] = [];
    migrationsMap[tag].push(agent.className);
  });
  
  config.migrations = Object.entries(migrationsMap).map(([tag, classes]) => ({
    tag,
    new_sqlite_classes: classes
  }));
  
  fs.writeFileSync(WRANGLER_CONFIG, JSON.stringify(config, null, 2));
  console.log('✓ Updated wrangler.jsonc');
}

function updateTypesFile(agents) {
  const imports = agents.map(agent => 
    `import type { ${agent.className} } from './agents/${agent.className}';`
  ).join('\n');
  
  const bindings = agents.map(agent => 
    `  ${agent.bindingName}: AgentNamespace<${agent.className}>;`
  ).join('\n');
  
  const content = `import { AgentNamespace } from 'agents';
${imports}

export interface WorkerEnv {
${bindings}
  OPENAI_API_KEY: string;
}`;

  fs.writeFileSync(TYPES_FILE, content);
  console.log('✓ Updated types.ts');
}

function updateIndexFile(agents) {
  const currentIndex = fs.readFileSync(INDEX_FILE, 'utf8');
  
  // Update imports section
  const imports = agents.map(agent => 
    `import { ${agent.className} } from './agents/${agent.className}';`
  ).join('\n');
  
  // Update exports section
  const exports = agents.map(agent => 
    `export { ${agent.className} } from './agents/${agent.className}';`
  ).join('\n');
  
  // Replace import and export sections
  let updatedContent = currentIndex
    .replace(
      /import { .+ } from '\.\/agents\/.+';/g, 
      ''
    )
    .replace(
      /export { .+ } from '\.\/agents\/.+';/g,
      ''
    );
  
  // Add new imports after existing imports
  updatedContent = updatedContent.replace(
    /import type { WorkerEnv } from '\.\/types';/,
    `${imports}\n// Export the Env type for use in Agent classes\nexport type { WorkerEnv } from './types';\nimport type { WorkerEnv } from './types';`
  );
  
  // Add new exports at the end
  updatedContent = updatedContent.replace(
    /export { .+ } from '\.\/agents\/.+';?$/,
    ''
  ) + '\n\n// Re-export Agent classes for wrangler.jsonc to find them\n' + exports;
  
  fs.writeFileSync(INDEX_FILE, updatedContent);
  console.log('✓ Updated index.ts');
}

function main() {
  console.log('🔍 Scanning agents directory...');
  const agents = scanAgents();
  
  console.log(`📋 Found ${agents.length} agents:`);
  agents.forEach(agent => {
    console.log(`  - ${agent.className} -> ${agent.bindingName}`);
  });
  
  console.log('\n🔧 Updating configuration files...');
  updateWranglerConfig(agents);
  updateTypesFile(agents);
  updateIndexFile(agents);
  
  console.log('\n✅ Agent registration complete!');
  console.log('\n⚠️  Manual steps still required:');
  console.log('  1. Review the generated routing logic in src/index.ts');
  console.log('  2. Add any missing environment variables to WorkerEnv interface');
  console.log('  3. Run tests to verify configuration');
}

if (require.main === module) {
  main();
}

module.exports = { scanAgents, updateWranglerConfig, updateTypesFile, updateIndexFile };