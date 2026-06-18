# Deploy a Railway - Facturas7

Guía paso a paso para desplegar a producción.

## 1. Setup Railway

### Crear cuenta
1. Ir a https://railway.app
2. Signup con GitHub
3. Crear nuevo proyecto

### Conectar repo
```bash
cd /Users/carlosfedericogunther/Downloads/Claudio/Facturas7
railway link
```

Railway detecta `railway.toml` automáticamente.

## 2. Configurar variables entorno

```bash
railway variables
```

O via dashboard:

```env
# Evolution API
EVOLUTION_API_URL=https://evo.lab7.com.ar
EVOLUTION_API_TOKEN=1FAECBD2909F-48D4-AA03-B5287BA7CF68
EVOLUTION_INSTANCE=Facturas-WhatsApp

# Chatwoot
CHATWOOT_URL=https://chat.lab7.com.ar
CHATWOOT_WEBHOOK_SECRET=9Hnte4Jkk4M1c5ozoMCUfHtL

# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-xxxx
MP_PLAN_ID=plan_xxxx
MP_WEBHOOK_SECRET=tu_webhook_secret

# Afip (después)
AFIPSDK_TOKEN=
AFIPSDK_ENTORNO=homologacion

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=cambiar_en_produccion
SESSION_SECRET=cambiar_en_produccion

# App
PORT=3000
BASE_URL=https://tu-dominio-railway.up.railway.app
NODE_ENV=production
```

## 3. BD PostgreSQL (Railway)

Railway puede hospedar BD. Opciones:

### A) Usar SQLite (actual)
```bash
# Ya funciona, sin cambios
npm start
```

### B) Migrar a PostgreSQL (recomendado)
```bash
# Railway crea BD automáticamente
# Actualizar db.js para usar PostgreSQL instead of SQLite
```

Por ahora dejamos SQLite.

## 4. Deploy

### Opción 1: via CLI
```bash
railway up
```

### Opción 2: via Dashboard
1. Ir a https://railway.app
2. Proyecto → Deploy
3. Seleccionar rama `main`
4. Click Deploy

### Seguir logs
```bash
railway logs
```

Debe mostrar:
```
✅ Base de datos inicializada
🚀 Servidor corriendo en puerto 3000
📋 Panel admin: https://tu-dominio-railway.up.railway.app/admin/login
```

## 5. Dominios Railway

Railway auto-genera dominio tipo:
```
https://facturas7-production.up.railway.app
```

Para custom domain:
1. Railway dashboard → Settings
2. Custom Domain → Agregar tu dominio
3. CNAME a `railway.app`

## 6. Variables webhook

Actualizar después de deploy:

### Evolution API
```
Webhook URL: https://tu-dominio-railway.up.railway.app/webhooks/evolution
```

### Mercado Pago
```
Webhook URL: https://tu-dominio-railway.up.railway.app/webhooks/mercadopago
```

### Chatwoot
```
Webhook URL: https://tu-dominio-railway.up.railway.app/webhooks/chatwoot (si lo agregas)
```

## 7. BD en Production

La BD SQLite se guarda en `/data/facturacion.db`.

Railway mantiene volumenes persistentes. Datos se preservan entre deploys.

**Backup:**
```bash
railway run backup.sh
# O descargar via Railway UI
```

## 8. Testing Production

```bash
# Health check
curl https://tu-dominio-railway.up.railway.app/health

# Admin login
https://tu-dominio-railway.up.railway.app/admin/login
usuario: admin
contraseña: (tu contraseña)

# React app
https://tu-dominio-railway.up.railway.app (redirige a /admin)
```

## 9. Monitoring

### Railway Dashboard
- CPU, RAM, logs en tiempo real
- Restart automático si falla

### Logs
```bash
railway logs -f
```

### Errores
Revisar en:
- Railway dashboard → Logs
- O via `railway logs --err`

## 10. Redeploy

Cada push a `main`:
```bash
git push
```

Railway detecta automáticamente y redeploy.

O manual:
```bash
railway up
```

## 11. Rollback

Si algo falla:
```bash
railway rollback
```

Vuelve a deploy anterior.

## 12. Secrets seguros

NO usar `.env` en GitHub. Railway maneja secrets:

```bash
# Agregar secret
railway variables set VAR_NAME=value

# No incluir en git
echo ".env" >> .gitignore
git add .gitignore
git commit -m "ignore .env"
```

## 13. Frontend (Vite)

El frontend React se puede:
- Servir desde mismo backend (build estático)
- O deploy separado (Vercel, Netlify)

### Opción 1: Mismo servidor
```bash
cd frontend
npm run build
# Copiar dist/ a backend/public
```

### Opción 2: Vercel (recomendado)
```bash
# Deploy frontend a Vercel
npm install -g vercel
cd frontend
vercel
```

Actualizar `vite.config.js` proxy URL a production:
```js
proxy: {
  '/admin': {
    target: 'https://tu-dominio-railway.up.railway.app',
    changeOrigin: true
  }
}
```

## Checklist Deploy

- [ ] Crear cuenta Railway
- [ ] Conectar repo (`railway link`)
- [ ] Configurar variables entorno
- [ ] Deploy inicial
- [ ] Verificar health check
- [ ] Login admin funciona
- [ ] Crear cliente test
- [ ] Verificar BD tiene datos
- [ ] Actualizar Evolution webhook URL
- [ ] Actualizar MP webhook URL
- [ ] Frontend funciona (si es separado)
- [ ] Logs limpio sin errores

## Troubleshooting

### "Port 3000 already in use"
Railway auto-asigna puerto. No necesita config.

### "BD not found"
```bash
railway run npm start
# Crea BD automáticamente
```

### "Webhook timeout"
Verificar que Evolution/MP pueden alcanzar dominio Railway.

### "Logs not showing"
```bash
railway logs -f --error
```

## Costo Railway

- **Free tier:** $5/mes crédito
- **Produtivo:** ~$20-50/mes (depende uso)
- **BD:** Incluida en free tier

Revisar: https://railway.app/pricing
