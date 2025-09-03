#!/usr/bin/env node

/**
 * Quick test script for MindMeld MCP Server
 * Tests HTTP MCP endpoints to ensure they work before adding to Warp
 */

const https = require('http');

function testMcpHttpEndpoint(endpoint, jsonRpcRequest, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing: ${description}`);
    console.log(`Endpoint: POST http://localhost:3001${endpoint}`);
    console.log(`Request: ${JSON.stringify(jsonRpcRequest)}`);

    const postData = JSON.stringify(jsonRpcRequest);

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const jsonResponse = JSON.parse(responseData);
          console.log(`✅ Status: ${res.statusCode}`);
          console.log(`✅ Response: ${JSON.stringify(jsonResponse, null, 2)}`);
          resolve({ jsonResponse, statusCode: res.statusCode });
        } catch (error) {
          console.log(`⚠️ Raw Response: ${responseData}`);
          resolve({ rawResponse: responseData, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Request failed: ${error.message}`);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function testHealthEndpoint() {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing: Server health check`);
    console.log(`Endpoint: GET http://localhost:3001/health`);

    const req = https.request({
      hostname: 'localhost',
      port: 3001,
      path: '/health',
      method: 'GET'
    }, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const jsonResponse = JSON.parse(responseData);
          console.log(`✅ Status: ${res.statusCode}`);
          console.log(`✅ Response: ${JSON.stringify(jsonResponse, null, 2)}`);
          resolve({ jsonResponse, statusCode: res.statusCode });
        } catch (error) {
          console.log(`⚠️ Raw Response: ${responseData}`);
          resolve({ rawResponse: responseData, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Health check failed: ${error.message}`);
      console.log(`ℹ️ Make sure the server is running with: FEATURE_MCP=1 npm start`);
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('🚀 Testing MindMeld MCP Server (HTTP Transport)\n');

  // First test server health
  try {
    await testHealthEndpoint();
  } catch (error) {
    console.error(`❌ Health check failed. Make sure server is running with: FEATURE_MCP=1 npm start`);
    return;
  }

  const tests = [
    {
      endpoint: '/mcp/resources/list',
      request: {"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}},
      description: "List available resources"
    },
    {
      endpoint: '/mcp/tools/list',
      request: {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}},
      description: "List available tools"
    },
    {
      endpoint: '/mcp/resources/read',
      request: {"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"mindmeld://health"}},
      description: "Read health resource"
    },
    {
      endpoint: '/mcp/tools/call',
      request: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"maps.list","arguments":{"limit":5}}},
      description: "Call maps.list tool"
    },
    {
      endpoint: '/mcp/resources/read',
      request: {"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"mindmeld://maps"}},
      description: "Read maps resource"
    }
  ];

  for (const test of tests) {
    try {
      await testMcpHttpEndpoint(test.endpoint, test.request, test.description);
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause between tests
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
    }
  }

  console.log('\n✅ MCP Server testing complete!');
  console.log('\n📋 Next Steps:');
  console.log('1. If all tests passed, the MCP server is ready to add to Warp');
  console.log('2. Use the warp-mcp.json configuration file with Warp');
  console.log('3. Primary endpoint: http://localhost:3001/mcp/sse (SSE)');
  console.log('4. Fallback endpoint: http://localhost:3001/mcp/* (HTTP)');
  console.log('5. Available commands in Warp:');
  console.log('   • "List my mind maps"');
  console.log('   • "Create a new mind map called [name]"');
  console.log('   • "Show server health status"');
  console.log('   • "Get map details for [map-id]"');
}

runTests().catch(console.error);
