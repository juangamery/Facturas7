# Facturas7 - SaaS Facturación Electrónica Argentina

Plataforma de facturación electrónica para Argentina con WhatsApp, Afip CAE y Mercado Pago.

## Arquitectura

- **Backend:** Node.js + Express + SQLite
- **Frontend:** React 18 + Vite + Bootstrap 5
- **WhatsApp:** Evolution API
- **Chat Admin:** Chatwoot
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
- Evolution API (WhatsApp)
- Chatwoot (soporte)
- Afip (CAE)
- Mercado Pago (suscripción)

## Setup

### 1. Clonar repo
```bash
cd /Users/carlosfedericogunther/Downloads/Claudio/Facturas7
```

### 2. Variables entorno (.env)
```bash
# Evolution API + Chatwoot
EVOLUTION_API_URL=https://evo.lab7.com.ar
EVOLUTION_API_TOKEN=1FAECBD2909F-48D4-AA03-B5287BA7CF68
EVOLUTION_INSTANCE=Facturas-WhatsApp
CHATWOOT_URL=https://chat.lab7.com.ar
CHATWOOT_WEBHOOK_SECRET=9Hnte4Jkk4M1c5ozoMCUfHtL

# Mercado Pago
MP_ACCESS_TOKEN=tu_access_token
MP_PLAN_ID=tu_plan_id

# Afip (después configurar)
AFIPSDK_TOKEN=
AFIPSDK_ENTORNO=homologacion

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=tu_secret_aqui

# App
PORT=3000
BASE_URL=http://localhost:3000
NODE_ENV=development
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
- `POST /webhooks/evolution` - Recibe mensajes WhatsApp
- `POST /webhooks/chatwoot` - Webhook Chatwoot
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
│   ├── admin/        # Panel admin (routes, auth, views)
│   ├── evolution/    # WhatsApp (webhook, conversación, send)
│   ├── afip/         # Afip CAE
│   ├── mercadopago/  # Mercado Pago
│   ├── facturacion/  # PDF, validaciones
│   ├── db.js         # SQLite
│   ├── logger.js     # Logging
│   └── index.js      # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
├── data/             # SQLite DB
├── public/           # Static files
└── .env              # Variables entorno
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

## Configuración Evolution + Chatwoot

1. **Evolution API:** Instancia `Facturas-WhatsApp` con número WhatsApp
2. **Chatwoot:** Canal API `Facturas Whatsapp`
3. **Webhook URL:** `https://tu-dominio.com/webhooks/evolution`
4. **Secret:** Token de Chatwoot

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
