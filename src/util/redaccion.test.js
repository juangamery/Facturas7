import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactarClave, sinClave } from './redaccion.js';

test('redactarClave siempre enmascara', () => {
  assert.equal(redactarClave('miClave123'), '***');
  assert.equal(redactarClave(''), '***');
  assert.equal(redactarClave(undefined), '***');
});

test('sinClave enmascara password sin mutar el original', () => {
  const params = { cuit: '20123456789', username: '20123456789', password: 'secreta' };
  const limpio = sinClave(params);
  assert.equal(limpio.password, '***');
  assert.equal(limpio.cuit, '20123456789');
  assert.equal(params.password, 'secreta');
});
