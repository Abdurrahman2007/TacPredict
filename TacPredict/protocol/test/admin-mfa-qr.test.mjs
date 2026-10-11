import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatorQrSource } from '../../src/lib/auth/mfa-qr.mjs';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0h100v100H0z" /></svg>';
test('normalizes actual Supabase SDK data URI without double encoding', () => {
 for (const source of [svg, 'data:image/svg+xml;utf-8,' + svg, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)]) {
  assert.equal(decodeURIComponent(authenticatorQrSource(source).split(',')[1]), svg);
 }
});
test('preserves base64 SVG and rejects non-image inputs', () => {
 const source = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
 assert.equal(authenticatorQrSource(source), source);
 for (const source of ['', null, 'https://example.test', '<html>test</html>']) assert.throws(() => authenticatorQrSource(source));
});
