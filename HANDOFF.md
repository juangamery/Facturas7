# Facturas7 — Handoff completo

Bot de WhatsApp para facturación electrónica en Argentina (AFIP/ARCA). Este archivo resume TODO el estado del proyecto — arquitectura, qué se construyó, qué funciona probado, qué falta — para retomar en una sesión nueva de Claude sin perder contexto ni repetir investigación ya hecha.

## Qué es Facturas7

El cliente le escribe al bot de WhatsApp, se registra dando su CUIT y clave fiscal (una vez, se descarta), completa datos de negocio, y después puede emitir facturas mandando texto libre, audio o foto de un comprobante. El bot interpreta con IA (Groq), arma la factura, pide el CAE a AFIP, genera un PDF estilo oficial y lo manda por WhatsApp. Cobra una suscripción mensual vía Mercado Pago.

## Arquitectura

- **Backend:** Node.js + Express, deployado en Render (`facturas7.onrender.com`)
- **WhatsApp:** Meta Cloud API directo (Wappfly y Evolution API son legacy, ya no se usan)
- **Base de datos:** Supabase (Postgres), sin RLS en las tablas operativas (así están todas, no cambiar sin agregar policies)
- **IA:** Groq para todo (texto, audio, visión) — Gemini se sacó por completo
- **Facturación:** `@afipsdk/afip.js` (paquete real de AFIPSDK)
- **Pago:** Mercado Pago (Checkout Bricks + Suscripciones API)
- **PDF:** pdfkit + qrcode

Archivos clave:
- `src/bot/conversacion.js` — máquina de estados de la conversación (PASOS) + toda la lógica de interpretación con Groq
- `src/bot/bot.js` — enruta texto/imagen/audio al handler correcto
- `src/flujos/registro.js` — registro + setup automático de ARCA
- `src/facturacion/factura.js` — llamadas reales a AFIP (CAE, notas de crédito)
- `src/facturacion/arca_automation.js` — **ROTO, ver bloqueador abajo**
- `src/facturacion/pdf.js` — generación del PDF
- `src/mercadopago/` — suscripción + checkout + webhook
- `src/whatsapp/` — mensajes.js (envío), media.js (descarga), plantillas.js (todos los textos)

## Qué funciona (probado con evidencia real — no supuesto)

- **Registro conversacional:** CUIT + clave fiscal (se usa una vez, nunca se guarda) → luego nombre/email/domicilio/condición IVA en cualquier orden, Groq interpreta sin importar cómo lo escriba el usuario
- **Multi-ítem en facturas:** "Facturale a Juan, diseño de logo $5000, hosting $2000" en un solo mensaje — Groq separa cada ítem con su importe
- **Corrección conversacional:** en la confirmación de factura, si el usuario pide un cambio en vez de SI/NO, Groq lo interpreta y actualiza
- **Audio:** transcribe con Groq Whisper y extrae todos los datos, sin repetir preguntas ya respondidas en el mismo mensaje
- **Imagen:** Groq Vision (`qwen/qwen3.6-27b`, con `reasoning_effort: 'none'` para que no devuelva el bloque `<think>`) extrae datos de una foto de comprobante
- **PDF con diseño real de ARCA:** caja de tipo de comprobante (C/COD.011), datos emisor/receptor, tabla itemizada, totales, QR válido con la URL real que espera AFIP (`afip.gob.ar/fe/qr/?p=...`)
- **Nota de Crédito:** menú opción 4, usa `CbtesAsoc` del SDK real para anular la última factura — código verificado localmente con PDF real, **no probada en vivo con CAE real** (depende del bloqueador de abajo)
- **Mercado Pago:** suscripción completa vía Checkout Bricks (el cliente tokeniza su tarjeta en una página propia, `/checkout/:usuarioId`), activación inmediata al confirmar pago + webhook para cambios posteriores (cobro recurrente fallido, cancelación). Probado en vivo con cuenta de prueba de MP, usuario pasó a Activo/Plan Básico
- **Memoria de conversación:** tabla `mensajes_historial` guarda cada mensaje; al iniciar una factura nueva sin datos, si hay una factura previa la ofrece repetir
- **Menú principal:** 4 opciones (factura, última factura, mis datos, anular con nota de crédito), acepta también foto/audio directo

## El bloqueador grande: CAE real de AFIP

Hoy **todas las facturas usan CAE mock** (`TEST-...`), nunca un CAE real emitido por AFIP.

**Causa:** `arca_automation.js` genera un certificado **autofirmado con openssl** durante el onboarding. AFIP nunca reconoce ese certificado porque no pasó por el proceso real de delegación en ARCA — por eso `solicitarCAE` siempre tira 400 en `Afip.GetServiceTA` (el paso de autenticación, antes incluso de intentar facturar) y el código cae al fallback mock de homologación.

### La solución (investigada y confirmada contra la documentación real de AFIPSDK — no es un supuesto)

AFIPSDK tiene automatizaciones reales vía `afip.CreateAutomation(nombre, params, true)` (mismo paquete `@afipsdk/afip.js` ya instalado, no hace falta agregar nada). Estas automatizaciones controlan un browser real contra la página de ARCA — por eso sí generan certificados y delegaciones que AFIP reconoce de verdad.

**Paso 1 — una sola vez, para la cuenta de Facturas7 (CUIT 20347351300):**
```js
import Afip from '@afipsdk/afip.js';
const afip = new Afip({ access_token: process.env.AFIPSDK_TOKEN });

const cert = await afip.CreateAutomation("create-cert-prod", {
  cuit: "20347351300", username: "20347351300",
  password: "CLAVE_FISCAL_FACTURAS7", alias: "facturas7"
}, true);
// devuelve { data: { cert, key } } — certificado REAL reconocido por AFIP

await afip.CreateAutomation("auth-web-service-prod", {
  cuit: "20347351300", username: "20347351300",
  password: "CLAVE_FISCAL_FACTURAS7", alias: "facturas7", service: "wsfe"
}, true);
```
Guardar el `cert`/`key` resultantes en `AFIP_EMPRESA_CERT` / `AFIP_EMPRESA_KEY` (ya existen como env vars, hoy vacías en local — **verificar si en Render ya tienen algo real o es placeholder viejo**, eso decide si este paso ya está hecho).

**Paso 2 — por cada cliente nuevo (reemplaza `arca_automation.js` entero):**
```js
// El cliente delega (con SU clave fiscal, se usa una vez y se descarta — como ya se promete hoy)
await afip.CreateAutomation("delegate-web-service", {
  cuit: CLIENTE_CUIT, username: CLIENTE_CUIT, password: CLAVE_FISCAL_CLIENTE,
  service: "wsfe", delegate_to: "20347351300"
}, true);

// Facturas7 acepta (con SU PROPIA clave fiscal, guardada segura — nunca la del cliente)
await afip.CreateAutomation("accept-web-service-delegation", {
  cuit: "20347351300", username: "20347351300", password: "CLAVE_FISCAL_FACTURAS7",
  service: "wsfe", delegated_cuit: CLIENTE_CUIT
}, true);

// Punto de venta del cliente (con su clave, antes de descartarla)
await afip.CreateAutomation("create-sales-point", {
  cuit: CLIENTE_CUIT, username: CLIENTE_CUIT, password: CLAVE_FISCAL_CLIENTE,
  numero: N, sistema: "..." // ver doc para valores permitidos de 'sistema'
}, true);
```

Docs completas y actualizadas: https://afipsdk.com/docs/automations/introduction/ — secciones relevantes: `create-cert-prod`, `auth-web-service-prod`, `delegate-web-service`, `accept-web-service-delegation`, `create-sales-point`.

### Para retomar esto en una sesión nueva

Decile a Claude: *"Leé HANDOFF.md en Facturas7 y seguí con el bloqueador de CAE real de AFIP."*

Vas a necesitar a mano: tu CUIT (20347351300) y tu clave fiscal real, solo para el setup único del Paso 1. Las claves de los clientes las sigue pidiendo el bot normalmente y se siguen descartando.

## Otras cosas pendientes

- **Mercado Pago en producción real:** hoy corre con credenciales de una cuenta de prueba (`MP_ACCESS_TOKEN`/`MP_PUBLIC_KEY` de test). Cuando quieras cobrar de verdad, activar credenciales de producción reales en el panel de MP y cambiarlas en Render — el código no necesita cambios, ya usa el flujo correcto (Checkout Bricks + card_token_id)
- **Nota de Crédito:** falta probarla en vivo con un CAE real, una vez resuelto el bloqueador de arriba
- **Verificar `AFIP_EMPRESA_CERT`/`AFIP_EMPRESA_KEY` en Render:** si ya tienen algo cargado, confirmar si es un certificado real de AFIPSDK o un placeholder — decide si el Paso 1 de arriba ya está hecho
- **Código legado sin usar activamente pero presente:** `src/flujos/texto.js`, `src/flujos/natural.js`, `src/ia/` — una implementación paralela vieja, solo se alcanza si falta `GROQ_API_KEY` Y hay `ANTHROPIC_API_KEY` como fallback de imagen (`src/flujos/imagen.js`). No se tocó, bajo riesgo pero código duplicado/inconsistente si algún día se activa por accidente

## Migraciones SQL — correr en orden si no están ya aplicadas

Ver `db/migrations/`, en orden por fecha de archivo. Las últimas agregadas:
- `2026-07-14-delegacion.sql` — columnas `entorno`, `delegacion_estado`
- `2026-07-14-registro-pago.sql` — `estado_registro`, `mp_subscription_id`
- `2026-07-15-afipsdk-automatico.sql` — `afipsdk_cert`, `afipsdk_key`, `actualizado_en`
- `2026-07-15-facturas-items.sql` — `items` JSONB en `facturas`
- `2026-07-16-notas-credito.sql` — `factura_original_id` en `facturas`
- `2026-07-17-historial-mensajes.sql` — tabla `mensajes_historial`

## Variables de entorno necesarias (Render)

Ver `.env.example` para la lista completa y actualizada. Las más importantes:
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` — Meta Cloud API
- `GROQ_API_KEY` — texto, audio y visión (todo Groq ahora)
- `SUPABASE_URL`, `SUPABASE_KEY`
- `AFIPSDK_TOKEN`, `AFIP_EMPRESA_CUIT`, `AFIP_EMPRESA_CERT`, `AFIP_EMPRESA_KEY` — ver bloqueador arriba
- `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` — hoy de cuenta de prueba
- `BASE_URL` — **cuidado, ya pasó que quedó con el valor placeholder `https://your-render-url.onrender.com` sin reemplazar; debe ser la URL real del servicio**

## Historial de decisiones importantes (por si preguntan "por qué está así")

- **Wappfly → Meta Cloud API:** el proyecto arrancó con Wappfly, se migró a Meta directo. `media.js` tenía un bug donde seguía intentando descargar de Wappfly con IDs de Meta — por eso audio/imagen fallaban silenciosamente durante un tiempo
- **Gemini → Groq para visión:** Gemini retiró `1.5-flash` y después `2.5-flash` bajo nosotros, y el free tier tiene cuota muy baja. Se migró todo a Groq (`qwen/qwen3.6-27b`)
- **MercadoPago — por qué Checkout Bricks y no un link directo:** la API de "preapproval sin tarjeta, pago pendiente" (el enfoque más simple) da 500 genérico en la API real de MP pase lo que pase, confirmado probando contra su API. El único camino que funciona de verdad es tokenizar la tarjeta primero (Checkout Bricks) y crear la suscripción con `card_token_id`
- **`crearSuscripcion` viejo estaba mockeado:** durante un tiempo el código de MP tenía un mock hardcodeado que nunca llamaba a la API real — por eso "nunca funcionaba", literalmente no lo intentaba
- **Certificado AFIP autofirmado con openssl no sirve:** ver bloqueador principal arriba — es la causa de que el CAE nunca sea real
