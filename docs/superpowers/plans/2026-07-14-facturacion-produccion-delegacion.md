# Facturación en producción vía delegación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar facturación real (producción) a nombre de cada cliente monotributista, usando UN certificado de empresa y delegación de AFIP, con onboarding híbrido por WhatsApp.

**Architecture:** Un certificado de producción único (CUIT de la empresa) firma todas las emisiones. Cada cliente delega el web service `wsfe` a nuestro CUIT (rápido con clave fiscal, o manual con tutorial). La emisión pasa `CUIT=cliente` + `cert/key=empresa`. Estado de delegación por usuario en Supabase; switch homologación→producción por usuario.

**Tech Stack:** Node.js ESM, `@afipsdk/afip.js` v1.2.3 (SDK + automatizaciones), Supabase (Postgres), WhatsApp Cloud API, Groq NLU (ya integrado). Tests con el runner nativo `node --test` (sin dependencias nuevas).

---

## File Structure

- Create: `src/facturacion/onboarding.js` — wrappers de automatizaciones afipsdk (`delegate-web-service`, `accept-web-service-delegation`, `create-sales-point`) + orquestadores `activarClienteRapido` / `activarClienteManual`. Responsabilidad única: hablar con las automatizaciones de afipsdk para habilitar un CUIT.
- Create: `src/facturacion/onboarding.test.js` — tests de las funciones puras (construcción de params, redacción de clave).
- Create: `src/util/redaccion.js` — helper para no loguear claves fiscales. Reutilizable.
- Create: `src/util/redaccion.test.js` — tests del redactor.
- Modify: `src/facturacion/factura.js` — `crearAfip()` usa cert/key de empresa en producción.
- Modify: `src/bot/conversacion.js` — nuevos PASOS de activación producción.
- Modify: `src/bot/plantillas.js` — mensajes del flujo de activación (rápido, manual, tutorial, resultados).
- Modify: `src/flujos/texto.js` — handlers de los nuevos pasos + trigger "activar facturación real".
- Modify: `.env` — nuevas variables de empresa.
- Create: `docs/runbooks/certificado-empresa.md` — runbook one-time para generar el cert de empresa.
- Create: `scripts/generar-cert-empresa.js` — script one-time (lo corre el dueño) para `create-cert-prod` + `auth-web-service-prod`.
- Create: `db/migrations/2026-07-14-delegacion.sql` — columnas nuevas en `usuarios`.

---

## Task 1: Migración Supabase — columnas de delegación

**Files:**
- Create: `db/migrations/2026-07-14-delegacion.sql`

- [ ] **Step 1: Escribir el SQL de migración**

Create `db/migrations/2026-07-14-delegacion.sql`:

```sql
-- Estado de delegación y entorno por usuario
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS entorno text NOT NULL DEFAULT 'homologacion';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS delegacion_estado text NOT NULL DEFAULT 'pendiente';
-- Valores esperados de delegacion_estado: 'pendiente' | 'activa' | 'error'
-- punto_venta ya existe en la tabla.
```

- [ ] **Step 2: Aplicar en Supabase**

Correr el SQL en Supabase → SQL Editor. Verificar con:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios' AND column_name IN ('entorno','delegacion_estado');
```

Expected: 2 filas, ambas `text`, defaults `'homologacion'` y `'pendiente'`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/2026-07-14-delegacion.sql
git commit -m "feat(db): columnas entorno y delegacion_estado en usuarios"
```

---

## Task 2: Helper de redacción de claves (para logs seguros)

**Files:**
- Create: `src/util/redaccion.js`
- Test: `src/util/redaccion.test.js`

- [ ] **Step 1: Escribir el test que falla**

Create `src/util/redaccion.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactarClave, sinClave } from './redaccion.js';

test('redactarClave enmascara todo menos deja largo reconocible', () => {
  assert.equal(redactarClave('miClave123'), '***');
  assert.equal(redactarClave(''), '***');
  assert.equal(redactarClave(undefined), '***');
});

test('sinClave elimina la propiedad password de un objeto de params', () => {
  const params = { cuit: '20123456789', username: '20123456789', password: 'secreta' };
  const limpio = sinClave(params);
  assert.equal(limpio.password, '***');
  assert.equal(limpio.cuit, '20123456789');
  // no muta el original
  assert.equal(params.password, 'secreta');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test src/util/redaccion.test.js`
Expected: FAIL — "Cannot find module './redaccion.js'".

- [ ] **Step 3: Implementar el helper**

Create `src/util/redaccion.js`:

```js
// Utilidades para NO loguear claves fiscales.
// La clave fiscal del cliente jamás debe aparecer en logs.

export function redactarClave() {
  return '***';
}

// Devuelve una copia del objeto de params con password enmascarada.
export function sinClave(params) {
  if (!params || typeof params !== 'object') return params;
  return { ...params, ...(('password' in params) ? { password: '***' } : {}) };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test src/util/redaccion.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/util/redaccion.js src/util/redaccion.test.js
git commit -m "feat(util): helper de redaccion de claves fiscales para logs"
```

---

## Task 3: Módulo de onboarding — construcción de params (puro, testeable)

**Files:**
- Create: `src/facturacion/onboarding.js`
- Test: `src/facturacion/onboarding.test.js`

- [ ] **Step 1: Escribir el test que falla**

Create `src/facturacion/onboarding.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsDelegar, paramsAceptar, paramsPuntoVenta } from './onboarding.js';

test('paramsDelegar: el cliente delega al CUIT de la empresa', () => {
  const p = paramsDelegar('20-12345678-9', 'claveCliente', '20416142468');
  assert.equal(p.cuit, '20123456789');
  assert.equal(p.username, '20123456789');
  assert.equal(p.password, 'claveCliente');
  assert.equal(p.representante, '20416142468');
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
  assert.equal(p.sistema, 'RECE'); // Factura Electrónica - Monotributo - Webservice
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test src/facturacion/onboarding.test.js`
Expected: FAIL — "Cannot find module './onboarding.js'".

- [ ] **Step 3: Implementar las funciones puras de params**

Create `src/facturacion/onboarding.js`:

```js
// ==========================================
// ONBOARDING AFIP — delegación con certificado único de empresa
// ==========================================
// Habilita a un cliente para facturar en producción sin que genere
// certificados propios. El cliente delega el web service wsfe a nuestro CUIT
// (rápido con su clave, o manual por ARCA) y nosotros emitimos en su nombre.

import Afip from '@afipsdk/afip.js';
import { logger, logearError } from '../logger.js';
import { sinClave } from '../util/redaccion.js';

const ACCESS_TOKEN = process.env.AFIPSDK_TOKEN;
const EMPRESA_CUIT = process.env.AFIP_EMPRESA_CUIT;
const EMPRESA_CLAVE = process.env.AFIP_EMPRESA_CLAVE_FISCAL;

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

// El cliente (cuit) delega wsfe al representante (empresa).
export function paramsDelegar(cuitCliente, claveCliente, cuitEmpresa) {
  const cuit = soloDigitos(cuitCliente);
  return {
    cuit,
    username: cuit,
    password: claveCliente,
    representante: soloDigitos(cuitEmpresa),
    service: 'wsfe',
  };
}

// La empresa acepta la delegación que le hizo el cliente (representado).
export function paramsAceptar(cuitEmpresa, claveEmpresa, cuitCliente) {
  const cuit = soloDigitos(cuitEmpresa);
  return {
    cuit,
    username: cuit,
    password: claveEmpresa,
    representado: soloDigitos(cuitCliente),
    service: 'wsfe',
  };
}

// Crea el punto de venta webservice de monotributo del cliente.
export function paramsPuntoVenta(cuitCliente, claveCliente, numero) {
  const cuit = soloDigitos(cuitCliente);
  return {
    cuit,
    username: cuit,
    password: claveCliente,
    numero,
    sistema: 'RECE', // Factura Electrónica - Monotributo - Webservice
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test src/facturacion/onboarding.test.js`
Expected: PASS (3 tests).

> Nota: los nombres exactos de los parámetros `representante`/`representado`/`sistema`
> deben confirmarse contra la doc de cada automatización afipsdk antes del Task 4
> (páginas: delegate-web-service, accept-web-service-delegation, create-sales-point).
> Si difieren, ajustar acá y en el test en el mismo commit.

- [ ] **Step 5: Commit**

```bash
git add src/facturacion/onboarding.js src/facturacion/onboarding.test.js
git commit -m "feat(onboarding): params puros de delegacion/aceptacion/punto de venta"
```

---

## Task 4: Módulo de onboarding — orquestadores con afipsdk

**Files:**
- Modify: `src/facturacion/onboarding.js`

- [ ] **Step 1: Agregar los wrappers de automatización y orquestadores**

Añadir al final de `src/facturacion/onboarding.js`:

```js
function crearAfipAutomation() {
  return new Afip({ access_token: ACCESS_TOKEN });
}

// Ejecuta una automatización y loguea SIN la clave.
async function correr(afip, nombre, params) {
  logger.info(`⚙️ Automatización ${nombre} params=${JSON.stringify(sinClave(params))}`);
  const res = await afip.CreateAutomation(nombre, params, true);
  if (res?.status && res.status !== 'complete') {
    throw new Error(`Automatización ${nombre} estado=${res.status}`);
  }
  return res;
}

// Camino RÁPIDO: el cliente da su clave. Delegamos, aceptamos y creamos PV.
// La clave del cliente se usa acá y NO se retorna ni se persiste.
export async function activarClienteRapido(cuitCliente, claveCliente, numeroPuntoVenta = 1) {
  const afip = crearAfipAutomation();
  try {
    await correr(afip, 'delegate-web-service', paramsDelegar(cuitCliente, claveCliente, EMPRESA_CUIT));
    await correr(afip, 'accept-web-service-delegation', paramsAceptar(EMPRESA_CUIT, EMPRESA_CLAVE, cuitCliente));
    await correr(afip, 'create-sales-point', paramsPuntoVenta(cuitCliente, claveCliente, numeroPuntoVenta));
    logger.info(`✅ Cliente ${soloDigitos(cuitCliente)} activado (rápido)`);
    return { ok: true, punto_venta: numeroPuntoVenta };
  } catch (error) {
    logearError(error, 'activarClienteRapido');
    return { ok: false, error: error.message };
  }
}

// Camino MANUAL: el cliente ya delegó y creó su PV en ARCA. Solo aceptamos.
export async function activarClienteManual(cuitCliente, numeroPuntoVenta) {
  const afip = crearAfipAutomation();
  try {
    await correr(afip, 'accept-web-service-delegation', paramsAceptar(EMPRESA_CUIT, EMPRESA_CLAVE, cuitCliente));
    logger.info(`✅ Cliente ${soloDigitos(cuitCliente)} activado (manual)`);
    return { ok: true, punto_venta: numeroPuntoVenta };
  } catch (error) {
    logearError(error, 'activarClienteManual');
    return { ok: false, error: error.message };
  }
}
```

- [ ] **Step 2: Verificar que el módulo carga sin romper**

Run: `node --check src/facturacion/onboarding.js && node --test src/facturacion/onboarding.test.js`
Expected: sintaxis OK y los 3 tests de params siguen PASS (los orquestadores no se testean en vivo acá; se validan en Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/facturacion/onboarding.js
git commit -m "feat(onboarding): orquestadores activarClienteRapido/Manual con afipsdk"
```

---

## Task 5: Emisión con certificado de empresa en producción

**Files:**
- Modify: `src/facturacion/factura.js:16-20`

- [ ] **Step 1: Reescribir `crearAfip` para soportar producción con cert de empresa**

Reemplazar la función `crearAfip` en `src/facturacion/factura.js` (actualmente líneas ~16-20):

```js
const EMPRESA_CERT = process.env.AFIP_EMPRESA_CERT;
const EMPRESA_KEY = process.env.AFIP_EMPRESA_KEY;

// Crea instancia Afip para emitir en nombre de un CUIT (representado).
// En producción usa el certificado ÚNICO de la empresa (delegación).
function crearAfip(cuitRepresentado, produccion = PRODUCCION) {
  const cuit = parseInt(String(cuitRepresentado).replace(/\D/g, ''), 10);
  if (produccion) {
    return new Afip({
      CUIT: cuit,
      cert: EMPRESA_CERT,
      key: EMPRESA_KEY,
      access_token: ACCESS_TOKEN,
      production: true,
    });
  }
  return new Afip({ CUIT: cuit, access_token: ACCESS_TOKEN, production: false });
}
```

- [ ] **Step 2: Pasar el flag de entorno del usuario a `solicitarCAE`**

En `src/facturacion/factura.js`, en `solicitarCAE`, cambiar la creación de la instancia para respetar el entorno del usuario si viene en `datosFactura`:

Buscar:
```js
    const afip = crearAfip(datosFactura.cuit);
```
Reemplazar por:
```js
    const produccion = datosFactura.entorno === 'produccion';
    const afip = crearAfip(datosFactura.cuit, produccion);
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check src/facturacion/factura.js`
Expected: sin salida (OK).

- [ ] **Step 4: Commit**

```bash
git add src/facturacion/factura.js
git commit -m "feat(factura): emitir en produccion con cert unico de empresa (delegacion)"
```

---

## Task 6: Pasar el entorno del usuario al emitir

**Files:**
- Modify: `src/flujos/confirmacion.js:40-55`

- [ ] **Step 1: Incluir `entorno` en `datosFactura`**

En `src/flujos/confirmacion.js`, dentro del objeto `datosFactura` (después de `cuit: usuario.cuit,`), agregar:

```js
      entorno: usuario.entorno || 'homologacion',
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check src/flujos/confirmacion.js`
Expected: sin salida (OK).

- [ ] **Step 3: Commit**

```bash
git add src/flujos/confirmacion.js
git commit -m "feat(confirmacion): pasar entorno del usuario a la emision"
```

---

## Task 7: Mensajes y pasos del flujo de activación

**Files:**
- Modify: `src/bot/conversacion.js:26-33`
- Modify: `src/bot/plantillas.js`

- [ ] **Step 1: Agregar PASOS de activación**

En `src/bot/conversacion.js`, dentro de `PASOS`, agregar después de `RECOPILANDO`:

```js
  ACTIVAR_ELEGIR: 'activar_elegir',
  ACTIVAR_CLAVE: 'activar_clave',
  ACTIVAR_MANUAL_ESPERA: 'activar_manual_espera',
```

- [ ] **Step 2: Agregar mensajes en plantillas**

En `src/bot/plantillas.js`, dentro del objeto `MENSAJES`, agregar:

```js
  // ===== ACTIVACIÓN PRODUCCIÓN =====
  ACTIVAR_ELEGIR: `🚀 Para emitir facturas *reales* (con validez fiscal) tenés que habilitar tu AFIP una sola vez. Elegí:

1️⃣ *Rápido* — me pasás tu CUIT y clave fiscal, y lo hago yo (tu clave se usa una vez y NO se guarda).
2️⃣ *Manual* — te paso un tutorial y lo hacés vos en ARCA (nunca compartís tu clave).

Respondé 1 o 2.`,

  ACTIVAR_PEDIR_CLAVE: `🔐 Pasame en un solo mensaje tu *CUIT* y tu *clave fiscal* de AFIP.

Ejemplo: \`20123456789 miClaveFiscal\`

Tu clave se usa solo para habilitar el servicio y *no se almacena*.`,

  ACTIVAR_PROCESANDO: `⏳ Habilitando tu AFIP... esto tarda hasta 1 o 2 minutos. Ya te aviso.`,

  ACTIVAR_OK: `✅ ¡Listo! Tu cuenta ya emite facturas reales. Mandame los datos de la próxima factura cuando quieras.`,

  ACTIVAR_ERROR: `❌ No pude habilitar tu AFIP. Verificá que el CUIT y la clave fiscal sean correctos (clave nivel 3) e intentá de nuevo, o escribí *manual* para hacerlo por tutorial.`,

  ACTIVAR_TUTORIAL: (cuitEmpresa) => `📋 *Tutorial (2 pasos en ARCA):*

*1) Delegar la facturación:*
• Entrá a "Administrador de Relaciones" en AFIP.
• "Nueva Relación" → Servicio: *Web Services* → Aplicación: *Facturación Electrónica*.
• En "Representante" buscá el CUIT *${cuitEmpresa}* y confirmá dos veces.

*2) Crear punto de venta:*
• AFIP → "Administración de puntos de venta y domicilios" → "Agregar".
• Sistema: *Facturación Electrónica - Monotributo - Webservice*.
• Elegí un número que no uses y confirmá.

Cuando termines, escribime *listo* 👍`,

  ACTIVAR_MANUAL_OK: `✅ ¡Recibido! Ya vinculé tu delegación. Tu cuenta emite facturas reales. 🎉`,
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check src/bot/conversacion.js && node --check src/bot/plantillas.js`
Expected: sin salida (OK).

- [ ] **Step 4: Commit**

```bash
git add src/bot/conversacion.js src/bot/plantillas.js
git commit -m "feat(bot): pasos y mensajes del flujo de activacion produccion"
```

---

## Task 8: Handlers del flujo de activación en texto.js

**Files:**
- Modify: `src/flujos/texto.js`

- [ ] **Step 1: Importar el onboarding y helpers al tope de `texto.js`**

Agregar a los imports existentes en `src/flujos/texto.js`:

```js
import { activarClienteRapido, activarClienteManual } from './onboarding.js';
```

> Nota: `onboarding.js` está en `src/facturacion/`, así que el import correcto es:
> `import { activarClienteRapido, activarClienteManual } from '../facturacion/onboarding.js';`

- [ ] **Step 2: Enrutar los nuevos pasos**

En `procesarTexto` de `src/flujos/texto.js`, después del bloque `if (paso === PASOS.RECOPILANDO)`, agregar:

```js
    if (paso === PASOS.ACTIVAR_ELEGIR) {
      return await elegirActivacion(numeroDeTelefono, textoNorm, usuario);
    }
    if (paso === PASOS.ACTIVAR_CLAVE) {
      return await recibirClaveYActivar(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.ACTIVAR_MANUAL_ESPERA) {
      return await confirmarActivacionManual(numeroDeTelefono, textoNorm, usuario);
    }
```

- [ ] **Step 3: Detectar el trigger "activar facturación real" en el menú**

En `procesarMenuPrincipal` de `src/flujos/texto.js`, al inicio (antes del `if (textoNorm === '1')`), agregar:

```js
  if (/(ACTIVAR|FACTURA REAL|FACTURAS REALES|PRODUCCION|HABILITAR)/.test(textoNorm)) {
    await siguientePaso(numeroDeTelefono, PASOS.ACTIVAR_ELEGIR);
    await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_ELEGIR);
    return;
  }
```

- [ ] **Step 4: Implementar los handlers al final de `texto.js`**

Agregar al final de `src/flujos/texto.js`:

```js
// ===== ACTIVACIÓN PRODUCCIÓN =====

async function elegirActivacion(numeroDeTelefono, textoNorm, usuario) {
  if (textoNorm === '1' || textoNorm.includes('RAPID')) {
    await siguientePaso(numeroDeTelefono, PASOS.ACTIVAR_CLAVE);
    await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_PEDIR_CLAVE);
    return;
  }
  if (textoNorm === '2' || textoNorm.includes('MANUAL')) {
    await siguientePaso(numeroDeTelefono, PASOS.ACTIVAR_MANUAL_ESPERA);
    await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_TUTORIAL(process.env.AFIP_EMPRESA_CUIT));
    return;
  }
  await enviarTexto(numeroDeTelefono, 'Respondé 1 (rápido) o 2 (manual).');
}

async function recibirClaveYActivar(numeroDeTelefono, texto, usuario) {
  // Formato esperado: "CUIT clave". No logueamos el texto crudo.
  const partes = texto.trim().split(/\s+/);
  const cuit = (partes[0] || '').replace(/\D/g, '');
  const clave = partes.slice(1).join(' ');

  if (cuit.length !== 11 || !clave) {
    await enviarTexto(numeroDeTelefono,
      'Formato: primero el CUIT (11 dígitos), un espacio, y tu clave fiscal.\nEj: 20123456789 miClave');
    return;
  }

  await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_PROCESANDO);
  const r = await activarClienteRapido(cuit, clave, usuario.punto_venta || 1);

  if (!r.ok) {
    await siguientePaso(numeroDeTelefono, PASOS.ACTIVAR_ELEGIR);
    await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_ERROR);
    return;
  }

  await actualizarUsuario(usuario.id, {
    cuit,
    punto_venta: r.punto_venta,
    entorno: 'produccion',
    delegacion_estado: 'activa',
  });
  await limpiarConversacion(numeroDeTelefono);
  await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_OK);
}

async function confirmarActivacionManual(numeroDeTelefono, textoNorm, usuario) {
  if (!textoNorm.includes('LISTO')) {
    await enviarTexto(numeroDeTelefono, 'Cuando termines los 2 pasos en ARCA, escribime *listo*.');
    return;
  }
  await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_PROCESANDO);
  const r = await activarClienteManual(usuario.cuit, usuario.punto_venta || 1);

  if (!r.ok) {
    await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_ERROR);
    return;
  }

  await actualizarUsuario(usuario.id, {
    entorno: 'produccion',
    delegacion_estado: 'activa',
  });
  await limpiarConversacion(numeroDeTelefono);
  await enviarTexto(numeroDeTelefono, MENSAJES.ACTIVAR_MANUAL_OK);
}
```

- [ ] **Step 5: Corregir el import de onboarding**

Asegurar que el import del Step 1 quedó como:
```js
import { activarClienteRapido, activarClienteManual } from '../facturacion/onboarding.js';
```

- [ ] **Step 6: Verificar sintaxis**

Run: `node --check src/flujos/texto.js`
Expected: sin salida (OK).

- [ ] **Step 7: Commit**

```bash
git add src/flujos/texto.js
git commit -m "feat(texto): flujo de activacion produccion (rapido y manual) por WhatsApp"
```

---

## Task 9: Variables de entorno + runbook del certificado de empresa

**Files:**
- Modify: `.env`
- Create: `scripts/generar-cert-empresa.js`
- Create: `docs/runbooks/certificado-empresa.md`

- [ ] **Step 1: Agregar variables al `.env`**

Añadir a `.env` (valores reales los completa el dueño; NO commitear `.env`):

```
# AFIP producción — certificado ÚNICO de la empresa (delegación)
AFIP_EMPRESA_CUIT=
AFIP_EMPRESA_CLAVE_FISCAL=
AFIP_EMPRESA_CERT=
AFIP_EMPRESA_KEY=
```

> `AFIP_EMPRESA_CLAVE_FISCAL` se usa solo para `accept-web-service-delegation`.
> En Render van como Environment Variables (secrets). El cert/key son multilínea:
> pegarlos con `\n` escapados o usar Secret Files de Render.

- [ ] **Step 2: Crear el script one-time de generación del cert**

Create `scripts/generar-cert-empresa.js`:

```js
// One-time (lo corre el DUEÑO). Genera el certificado de producción de la EMPRESA
// y autoriza wsfe. Imprime cert+key para cargarlos como env vars/secret.
// Uso: AFIPSDK_TOKEN=... node scripts/generar-cert-empresa.js <CUIT> <claveFiscal>
import Afip from '@afipsdk/afip.js';

const [cuit, clave] = process.argv.slice(2);
if (!cuit || !clave) {
  console.error('Uso: node scripts/generar-cert-empresa.js <CUIT> <claveFiscal>');
  process.exit(1);
}

const afip = new Afip({ access_token: process.env.AFIPSDK_TOKEN });

try {
  const cuitLimpio = cuit.replace(/\D/g, '');
  const cert = await afip.CreateAutomation('create-cert-prod', {
    cuit: cuitLimpio, username: cuitLimpio, password: clave, alias: 'facturas7',
  }, true);

  await afip.CreateAutomation('auth-web-service-prod', {
    cuit: cuitLimpio, username: cuitLimpio, password: clave,
    alias: 'facturas7', service: 'wsfe',
  }, true);

  console.log('=== AFIP_EMPRESA_CERT ===\n' + cert.data.cert);
  console.log('\n=== AFIP_EMPRESA_KEY ===\n' + cert.data.key);
  console.log('\nGuardá estos valores como env vars. NO los commitees.');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
```

- [ ] **Step 3: Crear el runbook**

Create `docs/runbooks/certificado-empresa.md`:

```markdown
# Runbook: certificado único de la empresa (one-time)

Se hace UNA sola vez, con el CUIT y clave fiscal (nivel 3) de la empresa.

## Pasos

1. Tener `AFIPSDK_TOKEN` (de app.afipsdk.com).
2. Correr:
   ```bash
   AFIPSDK_TOKEN=xxx node scripts/generar-cert-empresa.js <CUIT_EMPRESA> <CLAVE_FISCAL>
   ```
3. Copiar `AFIP_EMPRESA_CERT` y `AFIP_EMPRESA_KEY` de la salida.
4. Cargarlos en Render → Environment (o Secret Files), junto con
   `AFIP_EMPRESA_CUIT` y `AFIP_EMPRESA_CLAVE_FISCAL`.
5. Redeploy.

## Notas
- El cert de producción no expira pronto (años). Renovar solo si AFIP lo pide.
- La clave fiscal de la empresa se guarda como secret (a diferencia de la del
  cliente, que nunca se persiste).
```

- [ ] **Step 4: Verificar sintaxis del script**

Run: `node --check scripts/generar-cert-empresa.js`
Expected: sin salida (OK).

- [ ] **Step 5: Commit (sin `.env`)**

```bash
git add scripts/generar-cert-empresa.js docs/runbooks/certificado-empresa.md
git commit -m "feat(scripts): runbook y script one-time para cert de empresa"
```

---

## Task 10: Verificación end-to-end (manual, sandbox y producción controlada)

**Files:** ninguno (verificación).

- [ ] **Step 1: Confirmar nombres de params contra la doc afipsdk**

Revisar las páginas `delegate-web-service`, `accept-web-service-delegation`,
`create-sales-point` de afipsdk y confirmar los nombres exactos
(`representante`/`representado`/`sistema`/`service`). Si difieren, corregir
`src/facturacion/onboarding.js` y su test, y commitear.

- [ ] **Step 2: Correr toda la suite de tests puros**

Run: `node --test src/`
Expected: PASS (redaccion + onboarding params).

- [ ] **Step 3: Verificar que no se loguea la clave**

Simular una activación con credenciales inválidas y revisar que en los logs
aparece `password: '***'` y nunca la clave real:

Run:
```bash
AFIPSDK_TOKEN=$(grep '^AFIPSDK_TOKEN=' .env | cut -d= -f2) \
AFIP_EMPRESA_CUIT=20111111112 AFIP_EMPRESA_CLAVE_FISCAL=x \
node --input-type=module -e "import {activarClienteRapido} from './src/facturacion/onboarding.js'; const r=await activarClienteRapido('20111111112','CLAVE_SECRETA_TEST',1); console.log('ok:',r.ok);" 2>&1 | grep -i "CLAVE_SECRETA_TEST" && echo "FALLA: clave logueada" || echo "OK: clave no aparece en logs"
```
Expected: "OK: clave no aparece en logs".

- [ ] **Step 4: Generar el cert de empresa (dueño)**

Seguir `docs/runbooks/certificado-empresa.md` con el CUIT real del dueño.
Cargar las 4 variables en `.env` local y en Render.

- [ ] **Step 5: Activación real end-to-end (camino rápido) con el CUIT del dueño**

Desde WhatsApp: escribir "activar" → 1 (rápido) → mandar `CUIT clave`.
Expected: mensaje `ACTIVAR_OK`. En Supabase, el usuario queda
`entorno='produccion'`, `delegacion_estado='activa'`, `punto_venta` seteado.

- [ ] **Step 6: Emitir una factura real**

Desde WhatsApp, pedir una factura (flujo natural ya existente) → confirmar.
Expected: llega el PDF con un CAE real de producción (verificable en ARCA,
a diferencia de homologación).

- [ ] **Step 7: Confirmar que un usuario en homologación sigue igual**

Con un usuario de prueba `entorno='homologacion'`, emitir una factura.
Expected: emite en homologación (sin cert de empresa), como antes. Sin regresión.

- [ ] **Step 8: Commit final de ajustes (si hubo)**

```bash
git add -A
git commit -m "fix(onboarding): ajustes tras verificacion end-to-end"
```

---

## Notas de implementación

- **Timeouts:** las automatizaciones tardan 30-90s. `CreateAutomation(..., true)` bloquea.
  El webhook de WhatsApp ya responde 200 rápido y procesa async, así que no hay timeout
  de Meta; el usuario recibe `ACTIVAR_PROCESANDO` mientras corre.
- **Render free tier:** si el server duerme durante la automatización, la corrida sigue
  del lado de afipsdk. Si el proceso muere, el usuario reintenta; `delegacion_estado`
  queda en 'pendiente'/'error' y no se marca 'activa' hasta que termine ok.
- **Seguridad de la clave del cliente:** nunca se pasa a `actualizarUsuario`, nunca se
  loguea (redacción en `correr`), y no se retorna desde los orquestadores.
