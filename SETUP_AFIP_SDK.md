# Configuración AFIP SDK - Facturación Electrónica

## Estado Actual
✅ **Homologación (TEST):** Funcionando
❌ **Producción:** Falta certificado digital

---

## 1️⃣ TEST MODE (Homologación) - YA FUNCIONA

### Variables necesarias (.env):
```
AFIPSDK_TOKEN=ynqaoy9HLCLlP3mYu7pwskTwqswwtsu1TljQebbRj2dPlEdEBrGVzTGOmDWKHPeC
AFIPSDK_ENTORNO=homologacion
```

### Test factura:
- Usuario TEST: CUIT 20347351300
- Tipo comprobante: Factura C (monotributo)
- Receptor: Consumidor Final o DNI válido
- Monto: cualquiera

**Bot emite factura → Groq genera PDF → AFIP retorna CAE TEST**

---

## 2️⃣ PRODUCCIÓN - Requiere Certificado Digital

Para emitir facturas reales en AFIP (producción):

### Paso A: Obtener certificado digital
1. Ir a https://www.afip.gob.ar/
2. "Servicios" → "Certificados Digitales"
3. Solicitar certificado (empresa/emprendedor)
4. AFIP envía por correo postal (1-2 semanas)

### Paso B: Importar certificado en servidor
```bash
# Certificado viene en formato .pfx (PKCS#12)
# Convertir a PEM (privada + publica):
openssl pkcs12 -in certificado.pfx -out private.pem -nocerts -nodes
openssl pkcs12 -in certificado.pfx -out cert.pem -nokeys
```

### Paso C: Configurar en Render
En **Settings → Environment**, agregar:

```
AFIPSDK_ENTORNO=produccion
AFIP_EMPRESA_CERT=<contenido de cert.pem entre comillas>
AFIP_EMPRESA_KEY=<contenido de private.pem entre comillas>
AFIPSDK_TOKEN=ynqaoy9HLCLlP3mYu7pwskTwqswwtsu1TljQebbRj2dPlEdEBrGVzTGOmDWKHPeC
```

### ⚠️ IMPORTANTE:
- **NO** compartir private.pem con nadie
- Render cifrará automáticamente
- Cada empresa necesita su certificado único

---

## 3️⃣ Flujo de Facturación Actual

```
Usuario envía "factura"
  ↓
Bot pide: nombre cliente → documento → concepto → importe
  ↓
Usuario confirma resumen
  ↓
Bot genera PDF (pdfkit)
  ↓
Bot llama solicitarCAE(datosFact)
  ↓
AFIP retorna CAE (código autorización)
  ↓
Bot guarda factura en BD + CAE
  ↓
Bot envía PDF al usuario
```

---

## 4️⃣ Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| CAE = "PENDIENTE" | AFIP offline/timeout | Bot reintenta automático |
| "CUIT inválido" | Formato incorrecto | Validar: 11 dígitos sin guiones |
| Cert error en prod | Certificado vencido | Renovar en https://www.afip.gob.ar |
| PDF no genera | pdfkit no instalado | `npm install pdfkit` |

---

## 5️⃣ Status Integration

**Líneas de código clave:**

| Archivo | Función | Línea |
|---------|---------|-------|
| `src/facturacion/factura.js` | `solicitarCAE()` | 64 |
| `src/bot/conversacion.js` | `procesarFacturaTexto()` | 276 |
| `.env.example` | Variables AFIP | 29-32 |

---

## TEST Inmediato

Envía esto por WhatsApp al bot (en homologacion):
```
1. "Factura"
2. "Cliente Test"
3. "CF" (consumidor final)
4. "Test de factura"
5. "1000" (monto)
6. "Si" (confirmación)

Bot emite → retorna CAE real de AFIP test
```

---

**Status:** Homologación lista ✅ | Producción pendiente certificado 🔒
