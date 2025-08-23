#!/usr/bin/env node
/* Simple env sanity check */
const required = ['PORT', 'CORS_ORIGIN', 'JSON_LIMIT', 'NODE_ENV'];
let ok = true;
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[env-check] Missing ${key}`);
    ok = false;
  }
}
if (!ok) {
  process.exit(1);
}
console.log('[env-check] Environment looks OK');
