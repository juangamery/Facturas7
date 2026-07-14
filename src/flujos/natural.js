// ==========================================
// FLUJO NATURAL - Facturar hablando como humano
// ==========================================
// Reemplaza la carga paso a paso. El usuario tira los datos como quiere
// (todo junto o de a poco, texto o audio). Groq interpreta y acumula.
// Cuando están los 4 datos -> resumen y confirmación.

import {
  obtenerEstado,
  siguientePaso,
  limpiarConversacion,
  mostrarMenuPrincipal,
  PASOS,
} from '../bot/conversacion.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { logger } from '../logger.js';
import { interpretarFactura, camposFaltantes } from '../ia/interpretar.js';

// Etiquetas humanas para pedir lo que falta
const PIDE = {
  razon_social_cliente: 'el *nombre o razón social* del cliente',
  documento_cliente: 'el *CUIT o DNI* del cliente (o poné CF si es consumidor final)',
  concepto: 'qué estás *facturando* (el concepto)',
  importe: 'el *importe* en pesos',
};

// Etiqueta el documento según su tipo real (AFIP los distingue por longitud)
function etiquetaDocumento(doc) {
  const d = String(doc || '').toUpperCase().trim();
  if (d === 'CF' || d === 'CONSUMIDOR FINAL') return 'Consumidor Final';
  const dig = d.replace(/\D/g, '');
  if (dig.length === 11) return `CUIT ${dig}`;
  if (dig.length === 7 || dig.length === 8) return `DNI ${dig}`;
  return d;
}

function resumen(c) {
  return `📋 Repasá la factura:

• Cliente: ${c.razon_social_cliente}
• ${etiquetaDocumento(c.documento_cliente)}
• Concepto: ${c.concepto}
• Importe: $${c.importe}
• Pago: ${c.condicion_venta || 'Contado'}

¿La emito? Respondé *sí* o *no* (o decime qué cambiar).`;
}

// Punto de entrada único para texto libre y audios transcriptos
export async function manejarFacturaNatural(numeroDeTelefono, texto, usuario, datosPrevios = {}) {
  const { intencion, campos, error } = await interpretarFactura(texto, datosPrevios);

  if (intencion === 'cancelar') {
    await limpiarConversacion(numeroDeTelefono);
    await enviarTexto(numeroDeTelefono, 'Listo, cancelé. Cuando quieras facturar avisame. 👍');
    return;
  }

  if (intencion === 'saludo' && camposFaltantes(campos).length === 4) {
    await siguientePaso(numeroDeTelefono, PASOS.RECOPILANDO, campos);
    await enviarTexto(numeroDeTelefono,
      `¡Hola ${usuario.nombre || ''}! 👋 Soy tu asistente de facturación.\n\nDecime a quién le facturás, qué y por cuánto. Podés tirarlo todo junto, ej:\n_"Facturá a Juan Pérez, CUIT 20-12345678-9, diseño de logo, 15000"_`);
    return;
  }

  const faltan = camposFaltantes(campos);

  // Guardar lo acumulado siempre
  await siguientePaso(numeroDeTelefono, faltan.length ? PASOS.RECOPILANDO : PASOS.CONFIRMACION_FACTURA, campos);

  if (faltan.length === 0) {
    await enviarTexto(numeroDeTelefono, resumen(campos));
    return;
  }

  // Faltan datos: pedir SOLO lo que falta, en tono amable
  const yaTengo = [];
  if (campos.razon_social_cliente) yaTengo.push(`cliente *${campos.razon_social_cliente}*`);
  if (campos.documento_cliente) yaTengo.push(`*${etiquetaDocumento(campos.documento_cliente)}*`);
  if (campos.concepto) yaTengo.push(`concepto *${campos.concepto}*`);
  if (campos.importe) yaTengo.push(`importe *$${campos.importe}*`);

  const pedir = faltan.map(k => '• ' + PIDE[k]).join('\n');

  let msg = '';
  if (error) {
    msg = 'Perdón, no te entendí bien. ';
  } else if (yaTengo.length) {
    msg = `Anoté: ${yaTengo.join(', ')}.\n\n`;
  }
  msg += `Me falta:\n${pedir}`;

  await enviarTexto(numeroDeTelefono, msg);
}

// Reintenta interpretar en el paso de confirmación cuando el usuario, en vez
// de decir sí/no, corrige o agrega un dato ("cambiá el importe a 20000").
export async function ajustarEnConfirmacion(numeroDeTelefono, texto, usuario) {
  const conv = await obtenerEstado(numeroDeTelefono);
  const datosPrevios = conv?.datos ? JSON.parse(conv.datos) : {};
  await manejarFacturaNatural(numeroDeTelefono, texto, usuario, datosPrevios);
}
