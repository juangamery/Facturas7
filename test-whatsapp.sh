#!/bin/bash

# Test WhatsApp flow sin número real
# Simula Evolution API webhook

API="http://localhost:3001"
NUMERO="5491234567890"

echo "=== Test WhatsApp Flow ==="
echo ""

# 1. NUEVO - Usuario nuevo
echo "1️⃣ Envía primer mensaje (estado NUEVO)"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_1\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"Hola\"
      }
    }
  }" | jq .
echo ""
sleep 2

# 2. PENDIENTE_VERIFICACION - Envía comprobante (imagen)
echo "2️⃣ Envía comprobante pago (imagen)"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_2\"
        },
        \"messageTimestamp\": $(date +%s),
        \"imageMessage\": {
          \"url\": \"https://example.com/comprobante.jpg\",
          \"caption\": \"Comprobante pago\"
        }
      }
    }
  }" | jq .
echo ""
sleep 2

# Simular aprobación admin (webhook mercado pago o manual)
echo "3️⃣ Admin aprueba comprobante (backend)"
sqlite3 /Users/carlosfedericogunther/Downloads/Claudio/Facturas7/data/facturacion.db "
  UPDATE conversaciones_whatsapp
  SET estado = 'ESPERANDO_NOMBRE'
  WHERE numero_whatsapp = '${NUMERO}'
"
echo "✓ Estado cambiado a ESPERANDO_NOMBRE"
echo ""
sleep 2

# 3. ESPERANDO_NOMBRE
echo "4️⃣ Usuario envía nombre"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_3\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"Juan García\"
      }
    }
  }" | jq .
echo ""
sleep 2

# 4. ESPERANDO_TELEFONO
echo "5️⃣ Usuario envía teléfono"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_4\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"+5491122334455\"
      }
    }
  }" | jq .
echo ""
sleep 2

# 5. ESPERANDO_CUIT
echo "6️⃣ Usuario envía CUIT"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_5\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"20123456789\"
      }
    }
  }" | jq .
echo ""
sleep 2

# 6. CONFIRMANDO
echo "7️⃣ Usuario confirma datos"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_6\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"SÍ\"
      }
    }
  }" | jq .
echo ""
sleep 2

# 7. LISTO_FACTURAR - Usuario crea factura
echo "8️⃣ Usuario crea factura (estado LISTO_FACTURAR)"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_7\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"Asesoría contable - 5000\"
      }
    }
  }" | jq .
echo ""

echo "=== Verifica BD ==="
echo "Conversaciones:"
sqlite3 /Users/carlosfedericogunther/Downloads/Claudio/Facturas7/data/facturacion.db \
  "SELECT numero_whatsapp, estado FROM conversaciones_whatsapp WHERE numero_whatsapp = '${NUMERO}';"

echo ""
echo "Usuarios:"
sqlite3 /Users/carlosfedericogunther/Downloads/Claudio/Facturas7/data/facturacion.db \
  "SELECT id, nombre, numero_telefono, cuit FROM usuarios WHERE numero_telefono = '${NUMERO}';"

echo ""
echo "✅ Test completo"
