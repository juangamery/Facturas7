// One-time (lo corre el DUEÑO). Genera el certificado de producción de la EMPRESA
// y autoriza wsfe. Imprime cert+key para cargarlos como env vars/secret.
// Uso: AFIPSDK_TOKEN=... node scripts/generar-cert-empresa.js <CUIT> <claveFiscal>
import Afip from '@afipsdk/afip.js';

const [cuit, clave] = process.argv.slice(2);
if (!cuit || !clave) {
  console.error('Uso: node scripts/generar-cert-empresa.js <CUIT> <claveFiscal>');
  process.exit(1);
}

const afip = new Afip({ access_token: process.env.AFIPSDK_TOKEN });

try {
  const cuitLimpio = cuit.replace(/\D/g, '');
  const cert = await afip.CreateAutomation('create-cert-prod', {
    cuit: cuitLimpio, username: cuitLimpio, password: clave, alias: 'facturas7',
  }, true);

  await afip.CreateAutomation('auth-web-service-prod', {
    cuit: cuitLimpio, username: cuitLimpio, password: clave,
    alias: 'facturas7', service: 'wsfe',
  }, true);

  console.log('=== AFIP_EMPRESA_CERT ===\n' + cert.data.cert);
  console.log('\n=== AFIP_EMPRESA_KEY ===\n' + cert.data.key);
  console.log('\nGuardá estos valores como env vars. NO los commitees.');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
