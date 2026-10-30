import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildExpiryReminder, daysUntil, localToday } from '../src/billing/reminders';

describe('expiry reminder helpers', () => {
  it('uses the Nicaragua calendar day, not UTC', () => {
    // 2026-10-30 03:00 UTC is still 2026-10-29 21:00 in Managua (UTC-6)
    assert.equal(localToday(Date.UTC(2026, 9, 30, 3)), '2026-10-29');
    assert.equal(localToday(Date.UTC(2026, 9, 30, 7)), '2026-10-30');
  });

  it('counts whole days to the expiration date', () => {
    assert.equal(daysUntil('2026-10-30', '2026-10-29'), 1);
    assert.equal(daysUntil('2026-10-29', '2026-10-29'), 0);
    assert.equal(daysUntil('2026-10-28', '2026-10-29'), -1);
    assert.equal(daysUntil('2026-11-01', '2026-10-29'), 3);
  });

  it('words the reminder for trials and paid plans', () => {
    assert.equal(buildExpiryReminder({ plan: 'Trial', expirationDate: '2026-10-30' }, 1)?.title,
      'Tu prueba gratis de VetSystem vence mañana');
    assert.equal(buildExpiryReminder({ plan: 'monthly', expirationDate: '2026-10-29' }, 0)?.title,
      'Tu suscripción de VetSystem vence hoy');
    assert.equal(buildExpiryReminder({ plan: 'monthly' }, 3)?.title, 'Tu suscripción de VetSystem vence en 3 días');
  });

  it('sends nothing for expired licenses or far-off dates', () => {
    assert.equal(buildExpiryReminder({ plan: 'Trial' }, -1), null);
    assert.equal(buildExpiryReminder({ plan: 'Trial' }, 10), null);
  });
});
