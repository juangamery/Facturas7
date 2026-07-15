# Configuración Groq para Transcripción de Audio

## Pasos para habilitar audio con Groq

### 1️⃣ Crear cuenta Groq (si no tienes)
- Ve a https://console.groq.com
- Registrate (gratis)
- Verifica email

### 2️⃣ Obtener API Key
- Login en https://console.groq.com
- Ve a "API Keys" en sidebar
- Click "Create API Key"
- Copia la key (formato: `gsk_...`)

### 3️⃣ Agregar a variables de entorno

**Local (.env):**
```
GROQ_API_KEY=gsk_tu_api_key_aqui
```

**Render (Dashboard):**
1. Ve a tu proyecto en Render
2. Settings → Environment
3. Agrega variable: `GROQ_API_KEY` = tu key
4. Deploy

### 4️⃣ Configuración actual del bot

**Modelo:** `whisper-large-v3-turbo`
- Transcripción en español
- Rápido y preciso
- Gratis (plan Groq)

**Idioma:** `es` (español)

**Archivo:** WAV mono/estéreo

### 5️⃣ Test audio

Envía audio en WhatsApp al bot mientras está en MENU_PRINCIPAL:
- Di algo en español
- Bot debe responder: "🎤 Procesando audio..."
- Luego ejecutar la transcripción como texto

### ⚠️ Troubleshooting

Si no transcribe:
1. Verificar GROQ_API_KEY está en .env
2. Verificar audio es válido (>1 seg, volumen normal)
3. Ver logs Render para errores
4. Reintentar (API puede tener lag)

---

**Status actual:** Media.js creado ✅ | Groq config listo ✅
