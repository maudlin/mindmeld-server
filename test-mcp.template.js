#!/usr/bin/env node

/**
 * Quick test script for MindMeld MCP Server
 * Tests resources and tools to ensure they work before adding to Warp
 */

const { spawn } = require('child_process');

function testMcpCommand(jsonRpcRequest, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing: ${description}`);
    console.log(`Request: ${JSON.stringify(jsonRpcRequest)}`);

    const mcp = spawn('node', ['bin/mcp-stdio.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      // Extract JSON response (first line of stdout)
      const lines = stdout.split('\n');
      const jsonResponse = lines[0];
      
      console.log(`✅ Response: ${jsonResponse}`);
      if (stderr.includes('ERROR')) {
        console.log(`⚠️ Stderr: ${stderr}`);
      }
      
      resolve({ jsonResponse, stderr, code });
    });

    // Send the JSON-RPC request
    mcp.stdin.write(JSON.stringify(jsonRpcRequest) + '\n');
    mcp.stdin.end();
  });
}

async function runTests() {
  console.log('🚀 Testing MindMeld MCP Server\n');

  const tests = [
    {
      request: {"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}},
      description: "List available resources"
    },
    {
      request: {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}},
      description: "List available tools"
    },
    {
      request: {"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"mindmeld://health"}},
      description: "Read health resource"
    },
    {
      request: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"maps.list","arguments":{"limit":5}}},
      description: "Call maps.list tool"
    },
    {
      request: {"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"mindmeld://maps"}},
      description: "Read maps resource"
    }
  ];

  for (const test of tests) {
    try {
      await testMcpCommand(test.request, test.description);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between tests
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
    }
  }

  console.log('\n✅ MCP Server testing complete!');
  console.log('\n📋 Next Steps:');
  console.log('1. If all tests passed, the MCP server is ready to add to Warp');
  console.log('2. Use the mcp-config.json file to configure Warp');
  console.log('3. In Warp, you should be able to access:');
  console.log('   • mindmeld://health - Server status');
  console.log('   • mindmeld://maps - List all maps');
  console.log('   • maps.list() - List maps tool');
  console.log('   • maps.get(id) - Get specific map');
  console.log('   • maps.summary(id) - Get map summary');
}

runTests().catch(console.error);
