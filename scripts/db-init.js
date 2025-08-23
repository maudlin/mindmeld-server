#!/usr/bin/env node
/* Placeholder DB init: ensure data directory exists. */
const fs = require('fs');
const path = require('path');
const sqliteFile =
  process.env.SQLITE_FILE || path.join(process.cwd(), 'data', 'db.sqlite');
const dir = path.dirname(sqliteFile);
fs.mkdirSync(dir, { recursive: true });
console.log(`[db-init] Ensured directory: ${dir}`);
