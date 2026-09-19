import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, validatePin } from '../services/authService.js';

test('phone account removes readable punctuation but preserves digits', () => {
  assert.equal(normalizePhone('+91 (987) 654-3210'), '919876543210');
});

test('phone account rejects non-phone input', () => {
  assert.throws(() => normalizePhone('farmer@example.com'), { code: 'INVALID_PHONE' });
});

test('PIN is exactly six digits', () => {
  assert.equal(validatePin('012345'), '012345');
  assert.throws(() => validatePin('12345'), { code: 'INVALID_PIN' });
  assert.throws(() => validatePin('abcdef'), { code: 'INVALID_PIN' });
});
