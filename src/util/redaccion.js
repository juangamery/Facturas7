// Utilidades para NO loguear claves fiscales.
// La clave fiscal del cliente jamás debe aparecer en logs.

export function redactarClave() {
  return '***';
}

// Devuelve una copia del objeto de params con password enmascarada.
export function sinClave(params) {
  if (!params || typeof params !== 'object') return params;
  return { ...params, ...(('password' in params) ? { password: '***' } : {}) };
}
