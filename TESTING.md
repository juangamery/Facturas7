# Testing Guide - Facturas7

Guide para testear sin número WhatsApp real.

## Setup para testing

### 1. Iniciar servidores

**Terminal 1 - Backend:**
```bash
npm start
```

Debe mostrar:
```
✅ Base de datos inicializada
🚀 Servidor corriendo en http://localhost:3000
📋 Panel admin: http://localhost:3000/admin/login
⚡ Webhook Meta: http://localhost:3000/webhooks/whatsapp
⚡ Webhook Evolution: http://localhost:3000/webhooks/evolution
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Debe mostrar:
```
VITE v5.4.21 ready in 293 ms
➜ Local: http://localhost:5173/
```

### 2. Acceso Admin

1. Abrir http://localhost:3000/admin/login
2. Usuario: `admin`
3. Contraseña: `admin123`
4. Click Dashboard

Debe mostrar:
- Usuarios Activos: 0
- Vencidos: 0
- Facturas Hoy: 0
- Facturas Mes: 0

### 3. Testing Panel Admin

#### Test 1: Crear cliente via API

```bash
curl -X POST http://localhost:3000/admin/clientes/nuevo \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Test",
    "numero_telefono": "5491234567890",
    "cuit": "20123456789",
    "razon_social": "Juan SRL",
    "plan": "basico"
  }'
```

**Esperado:** 
```json
{"success": true}
```

#### Test 2: Ver clientes en React

1. Abrir http://localhost:5173
2. Click "👥 Clientes"
3. Debe aparecer "Juan Test" en la lista

#### Test 3: Crear factura via API

```bash
curl -X POST http://localhost:3000/admin/facturas/nuevo \
  -H "Content-Type: application/json" \
  -d '{
    "usuario_id": 1,
    "razon_social_cliente": "Juan SRL",
    "documento_cliente": "20123456789",
    "concepto": "Asesoría contable",
    "importe": 5000
  }'
```

**Esperado:**
```json
{"success": true, "numero": "1234567890", "pdfPath": "..."}
```

#### Test 4: Ver facturas en React

1. Click "📄 Facturas"
2. Debe aparecer factura creada

### 4. Testing API Comprobantes (admin aprobación)

#### Test 1: Listar comprobantes pendientes

```bash
curl http://localhost:3000/admin/comprobantes
```

**Esperado:**
```json
{"comprobantes": []}
```

#### Test 2: Insertar comprobante test en BD

```bash
sqlite3 data/facturacion.db \
  "INSERT INTO comprobantes_pago (numero_whatsapp, tipo, contenido_texto, creado_en) \
   VALUES ('5491234567890', 'imagen', 'test_comprobante', $(date +%s))"
```

#### Test 3: Ver en React

1. Click "📋 Comprobantes"
2. Debe aparecer comprobante

#### Test 4: Aprobar comprobante

```bash
curl -X POST http://localhost:3000/admin/comprobantes/1/aprobar \
  -H "Content-Type: application/json" \
  -d '{"verificado_por": "admin_test"}'
```

**Esperado:**
```json
{"success": true}
```

### 5. Testing Webhook Evolution (simulado)

Simular mensaje WhatsApp:

```bash
curl -X POST http://localhost:3000/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "message": {
        "key": {
          "remoteJid": "5491234567890@s.whatsapp.net",
          "id": "msg_test_123"
        },
        "messageTimestamp": '$(date +%s)',
        "conversation": "Asesoría - $5000"
      }
    }
  }'
```

**Esperado:**
- Mensaje procesado
- Conversación creada en BD
- Response: 200 OK

### 6. Verificar BD

Ver datos creados:

```bash
sqlite3 data/facturacion.db ".tables"
# Ver usuarios
sqlite3 data/facturacion.db "SELECT * FROM usuarios"
# Ver facturas
sqlite3 data/facturacion.db "SELECT * FROM facturas"
# Ver conversaciones
sqlite3 data/facturacion.db "SELECT * FROM conversaciones_whatsapp"
```

### 7. Logs

Ver logs de la app:

```bash
# Seguir logs en tiempo real
tail -f data/app.log

# O ver últimas líneas
tail -20 data/app.log
```

## Checklist Testing

### Backend
- [ ] npm start sin errores
- [ ] Health check: GET http://localhost:3000/health → 200
- [ ] Crear cliente via API → success
- [ ] BD se crea con tablas

### Frontend
- [ ] npm run dev sin errores
- [ ] React abre en http://localhost:5173
- [ ] Navbar funciona (cambiar de páginas)
- [ ] Dashboard muestra stats
- [ ] Clientes lista se actualiza
- [ ] Facturas lista se actualiza
- [ ] Comprobantes lista funciona

### Admin Panel
- [ ] Login funciona (admin/admin123)
- [ ] Dashboard muestra datos
- [ ] Crear cliente desde formulario
- [ ] Ver clientes listados
- [ ] Crear factura
- [ ] Ver facturas

### API
- [ ] Crear cliente endpoint OK
- [ ] Crear factura endpoint OK
- [ ] Listar comprobantes endpoint OK
- [ ] Aprobar comprobante endpoint OK

## Issues comunes

### "Cannot find module"
```bash
npm install
cd frontend && npm install && cd ..
```

### "Port 3000 already in use"
```bash
lsof -i :3000
kill -9 <PID>
```

### "Port 5173 already in use"
```bash
lsof -i :5173
kill -9 <PID>
```

### BD corrompida
```bash
rm data/facturacion.db*
npm start
```

### Cambios no aparecen en React
```bash
# Limpiar cache Vite
rm -rf frontend/node_modules/.vite
npm run dev
```

## Next steps

Cuando tengas número WhatsApp:

1. Comprar chip nuevo
2. Obtener número
3. Configurar Evolution con número
4. Configurar Chatwoot webhook
5. Testear flujo completo end-to-end
6. Deploy a producción
