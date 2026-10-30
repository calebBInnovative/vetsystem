import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ManualPaymentError, validReceiptPath } from '../src/billing/manual-payments';

describe('manual payment receipt path', () => {
  it('accepts a receipt in the clinic own folder', () => {
    assert.equal(validReceiptPath('paymentReceipts/clinic-a/abc123XYZ_-9.jpg', 'clinic-a'), 'paymentReceipts/clinic-a/abc123XYZ_-9.jpg');
    assert.equal(validReceiptPath('paymentReceipts/clinic-a/abcdefgh.pdf', 'clinic-a'), 'paymentReceipts/clinic-a/abcdefgh.pdf');
  });

  it('treats a missing receipt as none', () => {
    assert.equal(validReceiptPath(undefined, 'clinic-a'), null);
    assert.equal(validReceiptPath('', 'clinic-a'), null);
  });

  it('rejects another clinic folder, traversal and unknown file types', () => {
    for (const path of [
      'paymentReceipts/clinic-b/abcdefgh.jpg',
      'paymentReceipts/clinic-a/../clinic-b/abcdefgh.jpg',
      'paymentReceipts/clinic-a/abcdefgh.exe',
      'paymentReceipts/clinic-a/short.jpg',
      'other/clinic-a/abcdefgh.jpg',
    ]) {
      assert.throws(() => validReceiptPath(path, 'clinic-a'), ManualPaymentError, path);
    }
  });
});
