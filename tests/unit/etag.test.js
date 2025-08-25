const { stableStringify, computeEtag } = require('../../src/utils/etag');

describe('etag utils', () => {
  it('produces stable canonical strings for objects regardless of key order', () => {
    const a = { z: 1, a: { b: 2, a: 1 }, m: [3, { y: 2, x: 1 }] };
    const b = { a: { a: 1, b: 2 }, m: [3, { x: 1, y: 2 }], z: 1 };

    const sa = stableStringify(a);
    const sb = stableStringify(b);

    expect(sa).toBe(sb);
  });

  it('hashes equivalent objects to the same ETag', () => {
    const a = { foo: { bar: [1, 2, 3] } };
    const b = { foo: { bar: [1, 2, 3] } };

    const ha = computeEtag(a);
    const hb = computeEtag(b);

    expect(ha).toBe(hb);
  });

  it('hashes different objects to different ETags', () => {
    const a = { foo: { bar: [1, 2, 3] } };
    const b = { foo: { bar: [1, 2, 4] } };

    const ha = computeEtag(a);
    const hb = computeEtag(b);

    expect(ha).not.toBe(hb);
  });
});
