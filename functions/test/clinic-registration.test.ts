import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { TRIAL_DAYS, slugifyClinicName, trialExpiration } from '../src/clinics/clinic.registration';

describe('clinic registration helpers', () => {
  it('trials last 14 days', () => {
    assert.equal(TRIAL_DAYS, 14);
  });

  it('computes the trial end from the UTC start day', () => {
    const now = Date.UTC(2026, 9, 20, 23, 59);
    assert.equal(trialExpiration(now), '2026-11-03');
  });

  it('slugifies clinic names like the client did', () => {
    assert.equal(slugifyClinicName("Pet's House Clínica"), 'pet-s-house-clinica');
    assert.equal(slugifyClinicName('  ¡¡ !! '), '');
  });
});
