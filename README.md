# Facturas7 - SaaS Facturación Electrónica Argentina

Plataforma de facturación electrónica para Argentina con WhatsApp, Afip CAE y Mercado Pago.

## Arquitectura

- **Backend:** Node.js + Express + Supabase
- **Frontend:** React 18 + Vite + Bootstrap 5
- **WhatsApp:** Wappfly API (QR code)
- **Chat Admin:** Chatwoot (legacy)
- **Facturación:** Afip CAE + pdfkit
- **Pago:** Mercado Pago suscripciones

## Features

✅ **Registro usuario vía WhatsApp**
- Comprobante de pago manual
- Verificación admin
- Datos: nombre, teléfono, CUIT

✅ **Facturas desde WhatsApp**
- Enviar concepto + importe
- Generación PDF automática
- CAE Afip (integrado)

✅ **Panel Admin**
- Verificar comprobantes pago
- Ver clientes
- Ver facturas
- Gestionar suscripciones

✅ **Integraciones**
- Wappfly (WhatsApp - QR code)
- Chatwoot (soporte)
- Afip (CAE)
- Mercado Pago (suscripción)

## Setup

### 1. Clonar repo
```bash
cd /Users/carlosfedericogunther/Downloads/Claudio/Facturas7
```

### 2. Variables entorno (.env)

Ver `.env.example` para lista completa. Mínimas requeridas:

```bash
# ===== OBLIGATORIO =====
# Wappfly (obtener en https://wappfly.com)
WAPPFLY_TOKEN=tu-token-de-wappfly

# Supabase
SUPABASE_URL=https://tu-supabase-url.supabase.co
SUPABASE_KEY=tu-supabase-key

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=tu-secret-aqui

# App
PORT=3001
BASE_URL=http://localhost:3001
```

Opcional:
```bash
# Mercado Pago (suscripciones)
MP_ACCESS_TOKEN=
MP_PLAN_BASICO_ID=
MP_PLAN_PREMIUM_ID=

# IA
GROQ_API_KEY=
ANTHROPIC_API_KEY=

# Email
MAIL_HOST=
MAIL_USER=
MAIL_PASS=
```

### 3. Instalar dependencias

**Backend:**
```bash
npm install
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 4. Iniciar servidores

**Terminal 1 - Backend (puerto 3000):**
```bash
npm start
```

**Terminal 2 - Frontend (puerto 5173):**
```bash
cd frontend
npm run dev
```

### 5. Acceso

- **Admin panel:** http://localhost:3000/admin/login
- **React app:** http://localhost:5173
- **Health check:** http://localhost:3000/health

## Flujo usuario

### 1. Nuevo usuario
```
Usuario envía mensaje a WhatsApp
    ↓
Bot: "Costo $500/mes. Paga aquí [link MP]"
    ↓
Usuario envía comprobante
    ↓
Admin aprueba en panel
    ↓
Bot: "¿Tu nombre?"
Usuario: "Juan"
    ↓
Bot: "¿Tu teléfono?"
Usuario: "1234567890"
    ↓
Bot: "¿Tu CUIT?" (opcional)
Usuario: "20123456789"
    ↓
Bot: "Confirmas? SÍ/NO"
Usuario: "SÍ"
    ↓
✅ Usuario registrado
```

### 2. Crear factura
```
Usuario envía: "Asesoría - $5000"
    ↓
Bot: "¿Confirmas?"
Usuario: "SÍ"
    ↓
✅ Factura generada
📄 PDF enviado
```

## Rutas API

### Públicas
- `POST /webhooks/whatsapp` - Recibe mensajes Wappfly
- `POST /webhooks/chatwoot` - Webhook Chatwoot (legacy)
- `GET /health` - Health check

### Admin (requieren login)
- `GET /admin/dashboard` - Stats
- `GET /admin/clientes` - Lista clientes
- `POST /admin/clientes/nuevo` - Crear cliente
- `GET /admin/facturas` - Lista facturas
- `POST /admin/facturas/nuevo` - Crear factura
- `GET /admin/comprobantes` - Comprobantes pendientes
- `POST /admin/comprobantes/:id/aprobar` - Aprobar
- `POST /admin/comprobantes/:id/rechazar` - Rechazar

## Estructura directorios

```
/Facturas7
├── src/
│   ├── admin/          # Panel admin (routes, auth, views)
│   ├── bot/            # Bot logic (webhook, conversación)
│   ├── whatsapp/       # Wappfly integration (mensajes.js)
│   ├── evolution/      # Evolution (legacy)
│   ├── chatwoot/       # Chatwoot integration
│   ├── afip/           # Afip CAE
│   ├── mercadopago/    # Mercado Pago
│   ├── facturacion/    # PDF, validaciones
│   ├── ia/             # IA (vision, audio)
│   ├── db.js           # Supabase + SQLite
│   ├── logger.js       # Logging
│   └── index.js        # Entry point
├── media/              # Downloaded media (images, audio)
├── public/             # Static files
├── .env                # Variables entorno
├── .env.example        # Template de .env
└── README.md           # Este archivo
```

## Configuración Afip

1. Descargar certificado digital de CUIT
2. Guardar en `/src/afip/certificado.pem`
3. Configurar en `.env`:
   ```
   AFIP_CUIT=tu_cuit
   AFIP_CERTIFICADO_PATH=/src/afip/certificado.pem
   ```

## Configuración Mercado Pago

1. Crear cuenta Mercado Pago
2. Ir a Settings → Credentials
3. Copiar Access Token
4. Crear plan de suscripción ($500/mes)
5. Configurar en `.env`:
   ```
   MP_ACCESS_TOKEN=tu_token
   MP_PLAN_ID=tu_plan_id
   ```

## Configuración Wappfly

### 1. Crear cuenta Wappfly
- Ir a https://wappfly.com
- Sign up / registrarse
- Completa datos de empresa

### 2. Conectar número WhatsApp
- En panel Wappfly, escanea QR code
- Autentica tu número WhatsApp
- Verifica conexión

### 3. Obtener Token
- En settings → API Keys
- Copiar "Bearer Token"
- Guardar en `.env`:
  ```
  WAPPFLY_TOKEN=tu-token-copiado
  ```

### 4. Configurar Webhook
- En panel Wappfly → Webhooks
- **URL:** `https://tu-render-url.onrender.com/webhooks/whatsapp`
  (O `http://localhost:3001/webhooks/whatsapp` en desarrollo)
- **Eventos:** Seleccionar `message` (mensajes entrantes)
- **Save**

### 5. Test local con ngrok
```bash
# Terminal 1 - backend
npm start

# Terminal 2 - ngrok
ngrok http 3001

# Copy forwarding URL: https://xxxxx-xx-xxx-xxx-xx.ngrok.io
# Usar esa URL en Wappfly webhook: https://xxxxx-xx-xxx-xxx-xx.ngrok.io/webhooks/whatsapp
```

## Deploy (Railway)

```bash
# 1. Conectar Railway
railway link

# 2. Agregar variables entorno
railway variables

# 3. Deploy
railway up
```

## Logs

```bash
# Ver logs backend
tail -f data/app.log

# Ver logs React
npm run dev (en otro terminal)
```

## TODO

- [ ] Implementar CAE real con Afip SDK
- [ ] Setup Mercado Pago suscripciones
- [ ] Transcripción audio (Groq)
- [ ] Descargar PDF desde panel
- [ ] Exportar facturas (Excel/CSV)
- [ ] Reportes mensuales
- [ ] Email con factura
- [ ] Soporte multi-empresa
- [ ] Afip WebService integrado

## Licencia

Privado - Carlos Federico Gunther

## Contacto

Email: cf.gunther@gmail.com
# Force redeploy Wed Jul  1 20:09:37 -03 2026
