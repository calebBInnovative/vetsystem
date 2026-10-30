import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { DEFAULT_PLANS, parsePlans, planIdOf } from '../src/billing/plans';

describe('subscription plans', () => {
  it('falls back to the defaults when nothing is saved', () => {
    assert.deepEqual(parsePlans(undefined), DEFAULT_PLANS);
  });

  it('keeps saved values and fills the rest from the defaults', () => {
    const catalog = parsePlans({ plans: { basic: { name: 'Inicio', maxUsers: 3, prices: { NIO: { monthly: 440 } } } } });
    assert.equal(catalog.basic.name, 'Inicio');
    assert.equal(catalog.basic.maxUsers, 3);
    assert.equal(catalog.basic.maxPatients, 500);
    assert.deepEqual(catalog.basic.prices.NIO, { monthly: 440 });
    assert.deepEqual(catalog.basic.prices.USD, DEFAULT_PLANS.basic.prices.USD);
    assert.deepEqual(catalog.clinic, DEFAULT_PLANS.clinic);
  });

  it('null means unlimited; invalid numbers and modules are ignored', () => {
    const catalog = parsePlans({ plans: { basic: {
      maxUsers: null, maxPatients: -4, modules: ['patients', 'hacking'], prices: { USD: { monthly: 0, annual: 99 } },
    } } });
    assert.equal(catalog.basic.maxUsers, null);
    assert.equal(catalog.basic.maxPatients, 500);
    assert.deepEqual(catalog.basic.modules, ['patients']);
    assert.deepEqual(catalog.basic.prices.USD, { annual: 99 });
  });

  it('maps licenses from before plans existed to Professional', () => {
    assert.equal(planIdOf('monthly'), 'professional');
    assert.equal(planIdOf('Trial'), 'professional');
    assert.equal(planIdOf('basic'), 'basic');
  });
});
