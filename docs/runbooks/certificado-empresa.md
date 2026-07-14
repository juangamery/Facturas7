# Runbook: certificado único de la empresa (one-time)

Se hace UNA sola vez, con el CUIT y clave fiscal (nivel 3) de la empresa.

## Pasos

1. Tener `AFIPSDK_TOKEN` (de app.afipsdk.com).
2. Correr:
   ```bash
   AFIPSDK_TOKEN=xxx node scripts/generar-cert-empresa.js <CUIT_EMPRESA> <CLAVE_FISCAL>
   ```
3. Copiar `AFIP_EMPRESA_CERT` y `AFIP_EMPRESA_KEY` de la salida.
4. Cargar en Render → Environment (o Secret Files), junto con
   `AFIP_EMPRESA_CUIT` y `AFIP_EMPRESA_CLAVE_FISCAL`.
5. Redeploy.

## Notas
- El cert de producción no expira pronto (años). Renovar solo si AFIP lo pide.
- La clave fiscal de la empresa se guarda como secret (a diferencia de la del
  cliente, que nunca se persiste).
- La automatización tarda 30-90s (navegador headless de afipsdk).
