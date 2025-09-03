#!/usr/bin/env node

/**
 * Setup script for MCP configuration
 * Generates local configuration files from templates
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function generateMcpConfig() {
  const projectRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(projectRoot, 'mcp-config.template.json');
  const configPath = path.join(projectRoot, 'mcp-config.json');
  
  console.log('🔧 Generating MCP configuration...');
  
  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template file not found:', templatePath);
    process.exit(1);
  }
  
  // Read template
  const template = fs.readFileSync(templatePath, 'utf8');
  
  // Replace placeholders
  const config = template.replace('${PROJECT_ROOT}', projectRoot.replace(/\\/g, '\\\\'));
  
  // Write config file
  fs.writeFileSync(configPath, config);
  
  console.log('✅ Generated:', configPath);
  console.log('📁 Project root:', projectRoot);
}

function generateTestScript() {
  const projectRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(projectRoot, 'test-mcp.template.js');
  const scriptPath = path.join(projectRoot, 'test-mcp.js');
  
  console.log('🧪 Generating MCP test script...');
  
  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template file not found:', templatePath);
    process.exit(1);
  }
  
  // Copy template to actual script
  const template = fs.readFileSync(templatePath, 'utf8');
  fs.writeFileSync(scriptPath, template);
  
  console.log('✅ Generated:', scriptPath);
}

function displayInstructions() {
  const projectRoot = path.resolve(__dirname, '..');
  const configPath = path.join(projectRoot, 'mcp-config.json');
  
  console.log('\n📋 Next Steps:');
  console.log('1. Test your MCP server:');
  console.log(`   node test-mcp.js`);
  console.log('\n2. Add to Warp:');
  console.log('   • Open Warp Settings → AI Assistant → MCP Servers');
  console.log('   • Use the configuration from:', configPath);
  console.log('\n3. Try these commands in Warp:');
  console.log('   • "List my mind maps"');
  console.log('   • "Show me the health status of my mindmeld server"');
  console.log('   • "What maps do I have available?"');
  
  console.log('\n🔒 Security:');
  console.log('   • Personal paths are NOT committed to git');
  console.log('   • Configuration files are in .gitignore');
  console.log('   • Use templates for sharing/collaboration');
}

function main() {
  console.log('🚀 MindMeld MCP Setup\n');
  
  try {
    generateMcpConfig();
    generateTestScript();
    displayInstructions();
    
    console.log('\n✅ Setup complete!');
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateMcpConfig, generateTestScript };
