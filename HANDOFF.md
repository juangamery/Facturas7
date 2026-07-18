# Facturas7 — Estado y próximos pasos (handoff)

Este archivo resume el estado real del proyecto para retomar en una sesión nueva sin perder contexto. Borralo o actualizalo cuando ya no haga falta.

## Qué funciona (probado con evidencia real, no supuesto)

- Registro + onboarding: CUIT, clave fiscal (se usa una vez, se descarta), datos de negocio en un solo mensaje
- Multi-ítem en facturas: "Facturale a Juan, diseño de logo $5000, hosting $2000" — Groq separa cada ítem
- PDF estilo ARCA con QR real (RG 4892/2020), tabla itemizada, título dinámico (FACTURA / NOTA DE CRÉDITO)
- Audio: transcribe y extrae todo sin repetir preguntas ya respondidas
- Imagen: Groq Vision (`qwen/qwen3.6-27b`, con `reasoning_effort: 'none'`) — Gemini se sacó por completo, daba 404 constantemente
- Nota de Crédito: código listo (`CbtesAsoc` real vía SDK), verificado localmente con PDF, **no probada en vivo con CAE real todavía**
- Mercado Pago: suscripción completa con Checkout Bricks (tokeniza tarjeta), activación inmediata + webhook, probado en vivo con cuenta de prueba
- Memoria de conversación: tabla `mensajes_historial`, ofrece repetir la última factura al iniciar una nueva

## El bloqueador grande: CAE real de AFIP

Hoy **todas las facturas usan CAE mock** (`TEST-...`) porque `arca_automation.js` genera un certificado **autofirmado con openssl**, y AFIP nunca lo reconoce (no está delegado de verdad). Por eso `solicitarCAE` siempre tira 400 y cae al fallback de homologación.

### La solución investigada y confirmada (documentación real de AFIPSDK, no supuesta)

AFIPSDK tiene automatizaciones reales vía `afip.CreateAutomation(nombre, params, true)` (mismo paquete `@afipsdk/afip.js` ya instalado). Flujo correcto:

**Una vez, para la cuenta de Facturas7 (CUIT 20347351300):**
```js
await afip.CreateAutomation("create-cert-prod", {
  cuit: "20347351300", username: "20347351300",
  password: "CLAVE_FISCAL_FACTURAS7", alias: "facturas7"
}, true);
// devuelve { data: { cert, key } } — certificado REAL reconocido por AFIP

await afip.CreateAutomation("auth-web-service-prod", {
  cuit: "20347351300", username: "20347351300",
  password: "CLAVE_FISCAL_FACTURAS7", alias: "facturas7", service: "wsfe"
}, true);
```
Guardar `cert`/`key` resultantes en las env vars que ya existen: `AFIP_EMPRESA_CERT`, `AFIP_EMPRESA_KEY` (hoy vacías en local, verificar si Render las tiene reales o son placeholder viejo).

**Por cada cliente nuevo (reemplaza `arca_automation.js` entero):**
```js
// 1. El cliente delega (con SU clave fiscal, se usa una vez y se descarta)
await afip.CreateAutomation("delegate-web-service", {
  cuit: CLIENTE_CUIT, username: CLIENTE_CUIT, password: CLAVE_FISCAL_CLIENTE,
  service: "wsfe", delegate_to: "20347351300"
}, true);

// 2. Facturas7 acepta (con SU PROPIA clave fiscal, guardada segura — no la del cliente)
await afip.CreateAutomation("accept-web-service-delegation", {
  cuit: "20347351300", username: "20347351300", password: "CLAVE_FISCAL_FACTURAS7",
  service: "wsfe", delegated_cuit: CLIENTE_CUIT
}, true);

// 3. Punto de venta del cliente (con la clave del cliente, antes de descartarla)
await afip.CreateAutomation("create-sales-point", {
  cuit: CLIENTE_CUIT, username: CLIENTE_CUIT, password: CLAVE_FISCAL_CLIENTE,
  numero: N, sistema: "..." // ver doc para valores permitidos de 'sistema'
}, true);
```

Docs completas: https://afipsdk.com/docs/automations/introduction/ (secciones: create-cert-prod, auth-web-service-prod, delegate-web-service, accept-web-service-delegation, create-sales-point).

### Para retomar esto en una sesión nueva

Decile a Claude: *"Leé HANDOFF.md en Facturas7, seguí con el bloqueador de CAE real de AFIP usando las automatizaciones de AFIPSDK que ya están documentadas ahí."*

Vas a necesitar tener a mano: tu CUIT (20347351300) y tu clave fiscal real, para el setup único de Facturas7 (paso 1). Las de los clientes las sigue pidiendo el bot normalmente.

## Otras cosas pendientes (menores)

- Mercado Pago: hoy corre con cuenta de prueba (`MP_ACCESS_TOKEN`/`MP_PUBLIC_KEY` de test). Cuando quieras cobrar de verdad, cambiar a credenciales de producción reales en Render — el código no necesita cambios.
- Nota de Crédito: falta probarla en vivo una vez que el CAE real funcione (depende del bloqueador de arriba).
- Verificar si `AFIP_EMPRESA_CERT`/`AFIP_EMPRESA_KEY` en Render son reales o placeholder — decisivo para saber si el paso "una vez" de arriba ya está hecho o hay que hacerlo de cero.

## Migraciones SQL pendientes de correr (si no se corrieron ya)

Revisar `db/migrations/` — las últimas son:
- `2026-07-15-facturas-items.sql`
- `2026-07-16-notas-credito.sql`
- `2026-07-17-historial-mensajes.sql`
