export function validarNombre(nombre) {
  return /^[a-záéíóúñ\s]+$/i.test(nombre.trim()) && nombre.trim().length >= 3;
}

export function validarTelefono(telefono) {
  const cleaned = telefono.replace(/\D/g, '');
  return cleaned.length >= 10;
}

export function validarCUIT(cuit) {
  const cleaned = cuit.replace(/\D/g, '');
  return cleaned.length === 11;
}

export function extraerDatos(texto) {
  const regexImporte = /[\$]?\s?(\d+(?:[.,]\d{2})?)/;
  const matchImporte = texto.match(regexImporte);

  return {
    importe: matchImporte ? parseFloat(matchImporte[1].replace(',', '.')) : null,
    concepto: texto.replace(regexImporte, '').trim()
  };
}
