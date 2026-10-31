import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { DEFAULT_PLANS, MODULE_SET, annualEnabled, parsePlans, parseStoredPlans, planIdOf, planLimits } from '../src/billing/plans';

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

  it('drops every annual price while annual selling is off, but keeps them stored', () => {
    const data = { annualEnabled: false, plans: { basic: { prices: { USD: { monthly: 12, annual: 120 }, NIO: { annual: 4000 } } } } };
    const sold = parsePlans(data);
    assert.deepEqual(sold.basic.prices, { USD: { monthly: 12 }, NIO: {} });
    for (const id of ['professional', 'clinic'] as const) assert.equal(sold[id].prices.USD.annual, undefined);
    assert.deepEqual(parseStoredPlans(data).basic.prices.USD, { monthly: 12, annual: 120 });
    assert.equal(annualEnabled(data), false);
  });

  it('sells annual periods unless the switch is explicitly off', () => {
    assert.equal(annualEnabled(undefined), true);
    assert.equal(annualEnabled({ annualEnabled: 'no' }), true);
    assert.equal(parsePlans({}).basic.prices.USD.annual, DEFAULT_PLANS.basic.prices.USD.annual);
  });

  it('grants a module added later to catalogs saved before it, as the plan defaults say', () => {
    const legacy = { plans: {
      basic: { modules: ['patients', 'schedule'] },
      professional: { modules: ['patients', 'schedule', 'finances'] },
    } };
    const catalog = parsePlans(legacy);
    assert.ok(catalog.professional.modules.includes('mobileApp'));
    assert.ok(!catalog.basic.modules.includes('mobileApp'));
  });

  it('respects the owner switching the mobile app off in a current catalog', () => {
    const current = { moduleSet: MODULE_SET, plans: { professional: { modules: ['patients', 'finances'] } } };
    assert.deepEqual(parsePlans(current).professional.modules, ['patients', 'finances']);
  });

  it('stamps license limits with the module set they were written under', () => {
    assert.equal(planLimits(DEFAULT_PLANS.professional).moduleSet, MODULE_SET);
    assert.ok(DEFAULT_PLANS.professional.modules.includes('mobileApp'));
  });

  it('maps licenses from before plans existed to Professional', () => {
    assert.equal(planIdOf('monthly'), 'professional');
    assert.equal(planIdOf('Trial'), 'professional');
    assert.equal(planIdOf('basic'), 'basic');
  });
});
