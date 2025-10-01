/**
 * Build MindMeld Yjs Client Bundle
 *
 * Creates a standalone browser bundle that clients can load via <script> tag
 * This allows zero-dependency clients to upgrade to WebSocket collaboration
 */

const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

async function buildYjsClientBundle() {
  console.log('🔨 Building MindMeld Yjs Client Bundle...\n');

  // Ensure dist directory exists
  const distDir = path.join(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  try {
    // Build the bundle
    await build({
      entryPoints: [path.join(__dirname, 'yjs-client-entry.js')],
      bundle: true,
      format: 'iife', // Immediately Invoked Function Expression (browser global)
      outfile: path.join(distDir, 'mindmeld-yjs-client.js'),
      minify: true,
      sourcemap: true,
      platform: 'browser',
      target: 'es2020',
      banner: {
        js:
          '/* MindMeld Yjs Client Bundle - Generated ' +
          new Date().toISOString() +
          ' */',
      },
    });

    const stats = fs.statSync(path.join(distDir, 'mindmeld-yjs-client.js'));
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log('✅ Bundle created successfully!');
    console.log(`   File: dist/mindmeld-yjs-client.js`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Sourcemap: dist/mindmeld-yjs-client.js.map\n`);
    console.log('📦 Clients can now load this via:');
    console.log(
      '   <script src="http://your-server/client/mindmeld-yjs-client.js"></script>\n',
    );
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildYjsClientBundle();
