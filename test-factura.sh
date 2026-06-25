#!/bin/bash

# Test generación de facturas desde WhatsApp

API="http://localhost:3001"
NUMERO="5491234567890"

echo "=== Test Generación Factura ==="
echo ""

# Asegurar que usuario está en estado LISTO_FACTURAR
sqlite3 /Users/carlosfedericogunther/Downloads/Claudio/Facturas7/data/facturacion.db \
  "UPDATE conversaciones_whatsapp SET estado = 'LISTO_FACTURAR' WHERE numero_whatsapp = '${NUMERO}'"

echo "Estado actualizado a LISTO_FACTURAR"
echo ""

# Usuario envía factura: "Concepto - Importe"
echo "Usuario envía: 'Asesoría contable - 5000'"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_factura_1\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"Asesoría contable - 5000\"
      }
    }
  }"

echo ""
sleep 1

# Usuario confirma factura con SÍ
echo ""
echo "Usuario confirma con: 'SÍ'"
curl -s -X POST "$API/webhooks/evolution" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": {
      \"message\": {
        \"key\": {
          \"remoteJid\": \"${NUMERO}@s.whatsapp.net\",
          \"id\": \"msg_factura_2\"
        },
        \"messageTimestamp\": $(date +%s),
        \"conversation\": \"SÍ\"
      }
    }
  }"

echo ""
echo ""
echo "=== Verifica BD ==="
echo ""
echo "Facturas creadas:"
sqlite3 /Users/carlosfedericogunther/Downloads/Claudio/Facturas7/data/facturacion.db \
  "SELECT id, numero_factura, usuario_id, concepto, importe FROM facturas WHERE usuario_id IN (SELECT id FROM usuarios WHERE numero_telefono = '${NUMERO}');"

echo ""
echo "✅ Test factura completo"
