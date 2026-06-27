# Vercel + Supabase Deployment Guide

## 1. Create Supabase Project

1. Go to https://supabase.com
2. Sign in / create account
3. New Project → name: "Facturas7"
4. Copy `SUPABASE_URL` and `SUPABASE_KEY` (anon key)

## 2. Set Up Database Schema

In Supabase SQL Editor, run:

```sql
CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT UNIQUE NOT NULL,
  nombre TEXT,
  cuit TEXT,
  razon_social TEXT,
  domicilio TEXT,
  condicion_iva TEXT DEFAULT 'Monotributista',
  punto_venta INTEGER,
  plan TEXT DEFAULT 'basico',
  activo INTEGER DEFAULT 0,
  fecha_registro INTEGER,
  fecha_vencimiento INTEGER,
  facturas_mes_actual INTEGER DEFAULT 0,
  limite_facturas_mes INTEGER DEFAULT 100,
  mp_subscription_id TEXT,
  notas TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE facturas (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id),
  numero_telefono TEXT NOT NULL,
  fecha_emision TEXT NOT NULL,
  tipo_comprobante TEXT DEFAULT 'Factura C',
  numero_factura TEXT NOT NULL,
  razon_social_cliente TEXT NOT NULL,
  documento_cliente TEXT NOT NULL,
  concepto TEXT NOT NULL,
  importe REAL NOT NULL,
  cae TEXT NOT NULL,
  vencimiento_cae TEXT NOT NULL,
  pdf_path TEXT,
  origen TEXT DEFAULT 'texto',
  creado_en INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversaciones (
  numero_telefono TEXT PRIMARY KEY,
  paso TEXT NOT NULL,
  datos TEXT DEFAULT '{}',
  ultima_actividad INTEGER NOT NULL
);

CREATE TABLE mensajes_procesados (
  message_id TEXT PRIMARY KEY,
  procesado_en INTEGER NOT NULL
);

CREATE TABLE pagos (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id),
  mp_payment_id TEXT UNIQUE,
  mp_subscription_id TEXT,
  monto REAL,
  estado TEXT,
  fecha INTEGER
);

CREATE TABLE conversaciones_whatsapp (
  id BIGSERIAL PRIMARY KEY,
  numero_whatsapp TEXT UNIQUE NOT NULL,
  estado TEXT DEFAULT 'NUEVO',
  datos_temporales TEXT DEFAULT '{}',
  comprobante_id BIGINT,
  creado_en INTEGER NOT NULL,
  actualizado_en INTEGER NOT NULL
);

CREATE TABLE comprobantes_pago (
  id BIGSERIAL PRIMARY KEY,
  numero_whatsapp TEXT NOT NULL,
  archivo_path TEXT,
  tipo TEXT DEFAULT 'imagen',
  contenido_texto TEXT,
  estado TEXT DEFAULT 'PENDIENTE',
  razon_rechazo TEXT,
  verificado_por TEXT,
  creado_en INTEGER NOT NULL,
  verificado_en INTEGER
);
```

## 3. Deploy to Vercel

1. Go to https://vercel.com
2. Import → Connect GitHub → select Facturas7
3. Framework: Vite (auto-detected)
4. Root Directory: . (root)
5. Environment Variables: Add all from `.env.example`:
   - SUPABASE_URL
   - SUPABASE_KEY
   - GROQ_API_KEY
   - MAIL_* (email credentials)
   - ADMIN_* (login credentials)
   - SESSION_SECRET
   - BASE_URL (set to your Vercel domain, e.g., https://facturas7.vercel.app)

6. Deploy → Wait for green status

## 4. Verify Deployment

- Frontend: https://facturas7.vercel.app
- API: https://facturas7.vercel.app/admin/dashboard
- Email receiver runs on backend (IMAP every 30s)

## 5. API Routes (Serverless)

- `POST /admin/email-groq` - GROQ-powered email parsing
- `GET /admin/stats` - Dashboard statistics
- `POST /admin/clientes-nuevo` - Auto-register from email
- All other routes on Express backend

## Environment Variables Required

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-anon-key
GROQ_API_KEY=gsk_...
MAIL_HOST=mail.web7.com.ar
MAIL_USER=facturas@web7.com.ar
MAIL_PASS=your-password
MAIL_IMAP_HOST=mail.web7.com.ar
MAIL_IMAP_PORT=993
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=any-random-string
BASE_URL=https://facturas7.vercel.app
```

## Done

System is now running on Vercel + Supabase. Email receiver continuously listens for incoming messages, GROQ parses them, Supabase stores, and PDF response is sent back.
