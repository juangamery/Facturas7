import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsDelegar, paramsAceptar, paramsPuntoVenta } from './onboarding.js';

test('paramsDelegar: el cliente delega al CUIT de la empresa', () => {
  const p = paramsDelegar('20-12345678-9', 'claveCliente', '20416142468');
  assert.equal(p.cuit, '20123456789');
  assert.equal(p.username, '20123456789');
  assert.equal(p.password, 'claveCliente');
  assert.equal(p.representante, '20416142468');
  assert.equal(p.service, 'wsfe');
});

test('paramsAceptar: la empresa acepta con sus credenciales', () => {
  const p = paramsAceptar('20416142468', 'claveEmpresa', '20-12345678-9');
  assert.equal(p.cuit, '20416142468');
  assert.equal(p.username, '20416142468');
  assert.equal(p.password, 'claveEmpresa');
  assert.equal(p.representado, '20123456789');
});

test('paramsPuntoVenta: crea PV webservice de monotributo', () => {
  const p = paramsPuntoVenta('20-12345678-9', 'claveCliente', 4);
  assert.equal(p.cuit, '20123456789');
  assert.equal(p.numero, 4);
  assert.equal(p.sistema, 'RECE');
});
