const { createHash } = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`,
  );
  return `{${entries.join(',')}}`;
}

function computeEtag(obj) {
  const canonical = stableStringify(obj);
  return createHash('sha256').update(canonical).digest('hex');
}

module.exports = { stableStringify, computeEtag };
