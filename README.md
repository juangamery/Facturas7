# Facturas7 - SaaS Facturación Electrónica Argentina

Plataforma de facturación electrónica para Argentina vía WhatsApp, con AFIPSDK (ARCA) y Mercado Pago.

## Arquitectura

- **Backend:** Node.js + Express + Supabase
- **Frontend:** React 18 + Vite + Bootstrap 5
- **WhatsApp:** Meta Cloud API (WhatsApp Business Platform)
- **IA:** Groq (interpretación de texto/audio) + Google Gemini Vision (imágenes)
- **Facturación:** AFIPSDK (@afipsdk/afip.js) + pdfkit
- **Pago:** Mercado Pago suscripciones

## Features

✅ **Registro + setup automático**
- Usuario da CUIT + clave fiscal (se usa una vez, se descarta)
- Bot delega facturación electrónica y obtiene punto de venta automáticamente
- Datos de negocio (nombre, email, domicilio, condición IVA) en un solo mensaje

✅ **Facturas desde WhatsApp (texto, audio o imagen)**
- Groq interpreta lenguaje libre, sin orden fijo
- Soporta múltiples conceptos/importes en una factura
- Gemini Vision extrae datos de una foto de recibo/comprobante
- Generación de PDF con layout tipo ARCA + QR (RG 4892/2020)
- CAE real vía AFIPSDK (mock en homologación si AFIP falla)

✅ **Panel Admin**
- Ver clientes, facturas, suscripciones

## Setup

### 1. Variables de entorno (.env)

Ver `.env.example` para la lista completa. Mínimas requeridas:

```bash
# WhatsApp Cloud API (Meta for Developers)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_API_VERSION=v21.0

# Supabase
SUPABASE_URL=
SUPABASE_KEY=

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=
SESSION_SECRET=

# App
PORT=3000
BASE_URL=http://localhost:3000
```

Opcional (habilita features):
```bash
# IA
GROQ_API_KEY=          # interpretación texto/audio, requerido para el flujo conversacional
GOOGLE_API_KEY=        # Gemini Vision (fotos de facturas/recibos)
ANTHROPIC_API_KEY=     # fallback de visión si no hay GOOGLE_API_KEY

# AFIPSDK
AFIPSDK_TOKEN=
AFIPSDK_ENTORNO=homologacion

# Mercado Pago
MP_ACCESS_TOKEN=
MP_PLAN_BASICO_ID=
MP_PLAN_PREMIUM_ID=
```

### 2. Instalar dependencias

**Backend:**
```bash
npm install
```

**Frontend:**
```bash
cd frontend && npm install && cd ..
```

### 3. Base de datos (Supabase)

Correr las migraciones en `db/migrations/` (SQL Editor de Supabase), en orden por fecha de archivo.

### 4. Iniciar

```bash
npm start
```

- **Admin panel:** http://localhost:3000/admin/login
- **Health check:** http://localhost:3000/health

## Configurar WhatsApp Cloud API (Meta)

1. Crear app en [Meta for Developers](https://developers.facebook.com) con producto WhatsApp
2. Copiar `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` desde API Setup
3. Configurar el webhook: **URL** `https://tu-dominio/webhooks/whatsapp`, **Verify Token** el mismo valor que `WHATSAPP_VERIFY_TOKEN`, suscribirse al evento `messages`

## Flujo de usuario nuevo

```
Usuario escribe al bot
    ↓
Bot pide CUIT + clave fiscal AFIP (se usa una vez, se descarta)
    ↓
Bot configura ARCA automáticamente (certificado + punto de venta)
    ↓
Usuario manda nombre/email/domicilio/condición IVA (en cualquier orden)
    ↓
Trial de 7 días activado + link de pago Mercado Pago
    ↓
Listo para facturar
```

## Emitir factura

```
Usuario: "Facturale a Juan Pérez, diseño de logo $5000, hosting $2000"
    ↓
Bot interpreta cliente + múltiples ítems, muestra resumen
    ↓
Usuario: "SI" (o pide una corrección: "el importe del hosting es 3000")
    ↓
Bot solicita CAE a AFIP, genera PDF, lo envía por WhatsApp
```

## Rutas API

### Públicas
- `POST /webhooks/whatsapp` - Recibe mensajes de Meta
- `POST /webhooks/mercadopago` - Webhook de pagos
- `GET /health` - Health check

### Admin (requieren login)
- `GET /admin/dashboard` - Stats
- `GET /admin/clientes` - Lista clientes
- `GET /admin/facturas` - Lista facturas

## Estructura de directorios

```
/Facturas7
├── src/
│   ├── admin/          # Panel admin
│   ├── bot/            # Máquina de estados de conversación (conversacion.js, bot.js)
│   ├── flujos/         # Registro, factura por texto/imagen
│   ├── whatsapp/       # Meta Cloud API (mensajes.js, media.js, plantillas.js)
│   ├── facturacion/    # AFIPSDK, PDF, validaciones
│   ├── mercadopago/    # Suscripciones + webhook
│   ├── ia/             # Vision/audio (legacy, ver flujos/imagen_vision.js para el path activo)
│   ├── db.js           # Cliente Supabase
│   └── index.js        # Entry point
├── db/migrations/      # SQL, correr en orden en Supabase
├── media/              # Media descargado de WhatsApp (gitignored)
├── facturas/           # PDFs generados (gitignored)
└── .env.example        # Template de .env
```

## Licencia

Privado - Carlos Federico Gunther

## Contacto

Email: cf.gunther@gmail.com
