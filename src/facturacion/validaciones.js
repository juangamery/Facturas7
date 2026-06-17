// ==========================================
// VALIDACIONES - CUIT, DNI, importes, etc
// ==========================================

// Validar CUIT con módulo 11
export function validarCUIT(cuit) {
  if (!cuit) return false;

  // Limpiar formato
  const cuitLimpio = cuit.replace(/\D/g, '');

  // Debe tener 11 dígitos
  if (cuitLimpio.length !== 11) return false;

  // Algoritmo módulo 11
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;

  for (let i = 0; i < 10; i++) {
    suma += parseInt(cuitLimpio[i]) * multiplicadores[i];
  }

  const resto = suma % 11;
  const digito = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;

  return digito === parseInt(cuitLimpio[10]);
}

// Validar documento (CUIT, DNI o CF)
export function validarDocumento(documento) {
  if (!documento) return false;

  const doc = documento.replace(/\s/g, '').toUpperCase();

  // Consumidor final
  if (doc === 'CF' || doc === 'CONSUMIDORFINAL') {
    return true;
  }

  // DNI (7-8 dígitos)
  if (doc.startsWith('DNI')) {
    const numero = doc.replace('DNI', '');
    return /^\d{7,8}$/.test(numero);
  }

  // CUIT (formato XX-XXXXXXXX-X)
  return validarCUIT(doc);
}

// Validar importe
export function validarImporte(importe) {
  // Debe ser número positivo
  return typeof importe === 'number' && importe > 0 && importe < 999999999;
}

// Validar que no esté vacío
export function validarNoVacio(texto) {
  return texto && texto.trim().length > 0;
}

// Validar punto de venta (número entre 1 y 9999)
export function validarPuntoVenta(punto) {
  const num = parseInt(punto);
  return !isNaN(num) && num >= 1 && num <= 9999;
}

// Parsear documento a valor numérico
export function parsearDocumento(documento) {
  const doc = documento.replace(/\D/g, '');
  return parseInt(doc) || 0;
}

// Obtener tipo de documento (para Afip SDK)
export function obtenerTipoDocumento(documento) {
  const doc = documento.replace(/\s/g, '').toUpperCase();

  if (doc === 'CF' || doc === 'CONSUMIDORFINAL') {
    return 99; // Consumidor final
  }

  if (doc.startsWith('DNI')) {
    return 96; // DNI
  }

  return 80; // CUIT (default)
}
