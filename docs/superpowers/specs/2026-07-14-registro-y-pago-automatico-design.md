# Registro y pago automático — Diseño

Fecha: 2026-07-14
Proyecto: Facturas7

## Problema

Hoy el bot **rechaza** a los desconocidos ("Este servicio es por suscripción").
El alta la hace el admin a mano en el panel. Queremos que el **bot registre,
cobre y active solo**, sin intervención manual, todo por WhatsApp.

## Decisiones (defaults confirmados)

- **Prueba gratis 7 días**, luego pago.
- **Suscripción recurrente** vía MercadoPago (preapproval). Si un mes falla → baja.
- **Un solo plan** para arrancar: Básico $299/mes, 100 facturas. (Premium después).
- Registro **conversacional por WhatsApp** (Groq extrae los datos).

## Flujo

```
Desconocido escribe
  → bot crea usuario (activo=0, estado_registro='nuevo') y arranca registro
  → pide: nombre, email (CUIT es opcional acá; se necesita al facturar real)
  → guarda datos, marca trial: activo=1, plan='trial',
     fecha_vencimiento = ahora + 7 días, estado_registro='trial'
  → "¡Listo! Tenés 7 días gratis. Mandame los datos de tu factura."
  → (el cliente ya puede facturar en homologación / o real si hizo delegación)

Al día 7 (o cuando quiera pagar):
  → bot genera link de suscripción MercadoPago y lo manda
  → cliente paga en el link (web MP)
  → WEBHOOK MP (preapproval authorized/payment approved):
      activo=1, plan='basico', estado_registro='pago_ok',
      fecha_vencimiento = ahora + 30 días, mp_subscription_id guardado
  → bot confirma: "✅ Suscripción activa"

Cada mes:
  → MP cobra solo. Webhook 'payment approved' → extiende fecha_vencimiento +30d.
  → Webhook 'payment rejected'/cancelado → activo=0, estado_registro='vencido'.

Ventana 24h:
  → Si el pago/cobro ocurre fuera de las 24h de la última interacción, la
    confirmación se manda con UNA plantilla de WhatsApp aprobada.
```

## Componentes

### 1. Estado en Supabase (columnas nuevas en `usuarios`)

- `estado_registro` text default 'nuevo'
  ('nuevo'|'esperando_nombre'|'esperando_email'|'trial'|'pago_ok'|'vencido')
- `email` text (ya existe)
- `mp_subscription_id` text
- `plan` text (ya existe; valores 'trial'|'basico'|'premium')
- `activo` int, `fecha_vencimiento` int (ya existen)

### 2. Cambiar el rechazo por registro (`src/bot/acceso.js`)

Hoy `verificarAcceso` devuelve `permitido=false` para desconocidos y el bot
manda `MENSAJES.NO_REGISTRADO`. Nuevo comportamiento:

- Si el usuario **no existe** → crearlo (`activo=0`, `estado_registro='nuevo'`)
  y devolver `{ permitido: true, usuario, nuevo: true }` para que el bot entre
  al flujo de registro en vez de rechazar.
- Si existe y está en trial/pago vigente → `permitido: true`.
- Si existe pero vencido → `permitido: true` pero `estado_registro='vencido'`;
  el flujo le ofrece pagar (no lo bloquea con un texto muerto).

### 3. Flujo de registro conversacional (`src/flujos/registro.js` nuevo)

- `iniciarRegistro(numero)` → pide nombre.
- Pasos nuevos en `PASOS`: `REG_NOMBRE`, `REG_EMAIL`.
- Usa Groq (interpretar) para extraer nombre/email de texto libre y validar email.
- Al completar → `activarTrial(usuario)`: setea trial 7 días y avisa.
- Trigger de pago: comando "pagar"/"suscribir" o al vencer el trial → `enviarLinkPago`.

### 4. Módulo MercadoPago (`src/pagos/mercadopago.js` nuevo)

- `crearSuscripcion(usuario)` → crea preapproval (plan $299/mes) y devuelve `init_point` (link).
- Guarda `mp_subscription_id` cuando MP lo devuelve.
- Usa `MP_ACCESS_TOKEN` (env, hoy vacío → prerequisito configurarlo).

### 5. Webhook MercadoPago (`src/pagos/webhook.js` nuevo + ruta en index)

- `POST /webhook/mercadopago` → recibe notificación, valida firma
  (`MP_WEBHOOK_SECRET`), consulta el pago/preapproval por id, y:
  - approved/authorized → activar/extender (activo=1, +30d, plan='basico').
  - rejected/cancelled → activo=0, estado_registro='vencido'.
- Idempotente (mismo evento no cobra dos veces): dedup por payment id.

### 6. Plantilla WhatsApp (post-24h)

- Crear en Meta **1 plantilla aprobada**: `suscripcion_activa`
  ("✅ ¡Tu suscripción de Facturas7 está activa! Ya podés facturar.").
- `enviarPlantilla(numero, plantilla, params)` en `src/whatsapp/mensajes.js`.
- El webhook usa texto normal si la ventana está abierta; plantilla si no.
  (Simplificación v1: intentar texto; si Meta responde error de ventana, usar plantilla).

### 7. Mensajes (`src/bot/plantillas.js`)

- `BIENVENIDA_REGISTRO`, `REG_PEDIR_NOMBRE`, `REG_PEDIR_EMAIL`, `TRIAL_ACTIVO`,
  `LINK_PAGO(url)`, `PAGO_CONFIRMADO`, `TRIAL_VENCIDO`.

## Prerequisitos

- Cuenta MercadoPago + credenciales de producción: `MP_ACCESS_TOKEN`,
  `MP_WEBHOOK_SECRET`, y el plan de suscripción creado (`MP_PLAN_BASICO_ID`).
- 1 plantilla de WhatsApp aprobada por Meta (`suscripcion_activa`).

## Fuera de alcance (YAGNI)

- Plan Premium (se agrega después).
- Registro por formulario web (es todo por WhatsApp).
- Cobro con tarjeta guardada fuera de MP.
- Reintentos de cobro custom (los maneja MP).

## Testing

- Unit: extracción de nombre/email (Groq) y transición de estados de registro.
- Webhook: simular payload approved/rejected → verificar activo/fecha_vencimiento.
- E2E sandbox MP: crear suscripción de prueba, pagar, ver activación por webhook.
- Verificar que un desconocido que escribe entra a registro (no rechazo).

## Riesgos

- MP webhook puede llegar duplicado → idempotencia por payment id.
- Ventana 24h: si el pago tarda, la confirmación necesita plantilla aprobada
  (dependemos de la aprobación de Meta).
- Trial abusable (un mismo CUIT/numero re-registrándose). v1: 1 trial por número.
