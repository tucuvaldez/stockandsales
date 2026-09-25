const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveAppMode, buildFeatureFlags } = require('../config');

test('resolveAppMode normalizes known modes', () => {
  assert.equal(resolveAppMode('LOCAL'), 'local');
  assert.equal(resolveAppMode('FACTURACION'), 'facturacion');
  assert.equal(resolveAppMode('billing'), 'billing');
});

test('buildFeatureFlags exposes local and billing modules correctly', () => {
  const localFlags = buildFeatureFlags('local');
  const billingFlags = buildFeatureFlags('facturacion');

  assert.equal(localFlags.inventory, true);
  assert.equal(localFlags.billing, false);
  assert.equal(billingFlags.billing, true);
  assert.equal(billingFlags.inventory, true);
});
