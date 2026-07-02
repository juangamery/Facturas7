// ==========================================
// FLUJO DE TEXTO - RIGUROSO Y CONCRETO
// ==========================================
// Validación estricta. Rechaza off-topic.
// Máquina de estados clara.

import {
  obtenerEstado,
  siguientePaso,
  guardarDato,
  obtenerDato,
  PASOS,
  mostrarMenuPrincipal,
  limpiarConversacion
} from '../bot/conversacion.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { MENSAJES } from '../bot/plantillas.js';
import { logger } from '../logger.js';
import { validarCUIT, validarDocumento, validarImporte } from '../facturacion/validaciones.js';
import { actualizarUsuario } from '../db.js';

export default async function procesarTexto(numeroDeTelefono, texto, usuario, paso, datos) {
  try {
    const textoNorm = texto.trim().toUpperCase();
    logger.debug(`[TEXTO] ${numeroDeTelefono} paso=${paso} input="${texto.substring(0,50)}"`);

    // CANCELAR - SIEMPRE VÁLIDO
    if (textoNorm === 'CANCELAR' || textoNorm === 'ESC') {
      limpiarConversacion(numeroDeTelefono);
      await enviarTexto(numeroDeTelefono, 'Cancelado. Volvé cuando quieras.');
      return;
    }

    // ===== ONBOARDING (Setup de usuario) =====
    if (paso === PASOS.ONBOARDING_CUIT) {
      return await validarYGuardarCUIT(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.ONBOARDING_RAZON_SOCIAL) {
      return await validarYGuardarRazonSocial(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.ONBOARDING_DOMICILIO) {
      return await validarYGuardarDomicilio(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.ONBOARDING_CONDICION_IVA) {
      return await validarYGuardarCondicionIVA(numeroDeTelefono, textoNorm, usuario);
    }
    if (paso === PASOS.ONBOARDING_PUNTO_VENTA) {
      return await validarYGuardarPuntoVenta(numeroDeTelefono, texto, usuario);
    }

    // ===== FLUJO FACTURA (Datos de factura) =====
    if (paso === PASOS.FLUJO_CLIENTE) {
      return await validarYGuardarCliente(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.FLUJO_DOCUMENTO) {
      return await validarYGuardarDocumento(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.FLUJO_CONCEPTO) {
      return await validarYGuardarConcepto(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.FLUJO_IMPORTE) {
      return await validarYGuardarImporte(numeroDeTelefono, texto, usuario);
    }
    if (paso === PASOS.CONFIRMACION_FACTURA) {
      return await confirmarFactura(numeroDeTelefono, textoNorm, usuario);
    }

    // ===== MENÚ PRINCIPAL =====
    if (paso === PASOS.MENU_PRINCIPAL) {
      return await procesarMenuPrincipal(numeroDeTelefono, textoNorm, usuario);
    }

    // Default: paso desconocido
    logger.warn(`Paso desconocido: ${paso}`);
    await mostrarMenuPrincipal(numeroDeTelefono, usuario.nombre);

  } catch (error) {
    logger.error(`Error en procesarTexto: ${error.message}`);
    await enviarTexto(numeroDeTelefono, '❌ Error procesando. Volvemos al menú.');
    await mostrarMenuPrincipal(numeroDeTelefono, usuario.nombre);
  }
}

// ===== ONBOARDING FUNCTIONS - SETUP =====

async function validarYGuardarCUIT(numeroDeTelefono, texto, usuario) {
  const cuit = texto.replace(/\D/g, '');

  if (!validarCUIT(cuit)) {
    await enviarTexto(numeroDeTelefono,
      '❌ CUIT inválido. Debe ser 11 dígitos (ej: 20123456789)');
    return;
  }

  guardarDato(numeroDeTelefono, 'cuit', cuit);
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_RAZON_SOCIAL);
  await enviarTexto(numeroDeTelefono, MENSAJES.PREGUNTA_RAZON_SOCIAL);
}

async function validarYGuardarRazonSocial(numeroDeTelefono, texto, usuario) {
  const razonSocial = texto.trim();

  if (razonSocial.length < 3) {
    await enviarTexto(numeroDeTelefono,
      '❌ Razón social muy corta. Mínimo 3 caracteres.');
    return;
  }

  guardarDato(numeroDeTelefono, 'razon_social', razonSocial);
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_DOMICILIO);
  await enviarTexto(numeroDeTelefono, MENSAJES.PREGUNTA_DOMICILIO);
}

async function validarYGuardarDomicilio(numeroDeTelefono, texto, usuario) {
  const domicilio = texto.trim();

  if (domicilio.length < 5) {
    await enviarTexto(numeroDeTelefono,
      '❌ Domicilio muy corto. Incluí calle, número, piso.');
    return;
  }

  guardarDato(numeroDeTelefono, 'domicilio', domicilio);
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CONDICION_IVA);
  await enviarTexto(numeroDeTelefono,
    '🏛️ ¿Cuál es tu condición IVA?\n\n1️⃣ Monotributista\n2️⃣ Responsable Inscripto\n\nResponde 1 o 2');
}

async function validarYGuardarCondicionIVA(numeroDeTelefono, textoNorm, usuario) {
  let condicion = null;

  if (textoNorm === '1' || textoNorm.includes('MONOTRIBUTISTA')) {
    condicion = 'Monotributista';
  } else if (textoNorm === '2' || textoNorm.includes('RESPONSABLE')) {
    condicion = 'Responsable Inscripto';
  } else {
    await enviarTexto(numeroDeTelefono,
      '❌ Respondé 1 (Monotributista) o 2 (Responsable Inscripto)');
    return;
  }

  guardarDato(numeroDeTelefono, 'condicion_iva', condicion);
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_PUNTO_VENTA);
  await enviarTexto(numeroDeTelefono,
    '🏪 ¿Punto de venta? (número o "NO TENGO")');
}

async function validarYGuardarPuntoVenta(numeroDeTelefono, texto, usuario) {
  const textoNorm = texto.trim().toUpperCase();

  if (textoNorm.includes('NO') || textoNorm.includes('SIN')) {
    await enviarTexto(numeroDeTelefono,
      '⚠️ Necesitas un punto de venta. Consultá con AFIP.');
    return;
  }

  const puntoVenta = parseInt(texto.trim());

  if (isNaN(puntoVenta) || puntoVenta < 1 || puntoVenta > 99999) {
    await enviarTexto(numeroDeTelefono,
      '❌ Punto de venta inválido. Debe ser un número entre 1 y 99999.');
    return;
  }

  // Guardar datos en BD
  const conversacion = obtenerEstado(numeroDeTelefono);
  const datosOnboarding = JSON.parse(conversacion.datos || '{}');

  try {
    await actualizarUsuario(usuario.id, {
      cuit: datosOnboarding.cuit,
      razon_social: datosOnboarding.razon_social,
      domicilio: datosOnboarding.domicilio,
      condicion_iva: datosOnboarding.condicion_iva,
      punto_venta: puntoVenta,
      nombre: datosOnboarding.razon_social
    });

    limpiarConversacion(numeroDeTelefono);
    await enviarTexto(numeroDeTelefono,
      '✅ Setup completo. Ahora podés emitir facturas.');
    await mostrarMenuPrincipal(numeroDeTelefono, datosOnboarding.razon_social);
  } catch (err) {
    logger.error(`Error guardando setup: ${err.message}`);
    await enviarTexto(numeroDeTelefono, '❌ Error guardando datos.');
  }
}

// ===== FLUJO FACTURA - DATOS =====

async function validarYGuardarCliente(numeroDeTelefono, texto, usuario) {
  const cliente = texto.trim();

  if (cliente.length < 3) {
    await enviarTexto(numeroDeTelefono,
      '❌ Nombre muy corto. Mínimo 3 caracteres.');
    return;
  }

  guardarDato(numeroDeTelefono, 'razon_social_cliente', cliente);
  siguientePaso(numeroDeTelefono, PASOS.FLUJO_DOCUMENTO);
  await enviarTexto(numeroDeTelefono,
    '🔢 ¿CUIT o DNI del cliente?\n\nFormatos:\n• CUIT: 20123456789\n• DNI: 12345678\n• CF (consumidor final)');
}

async function validarYGuardarDocumento(numeroDeTelefono, texto, usuario) {
  const doc = texto.replace(/\D/g, '').toUpperCase();

  if (texto.toUpperCase().trim() === 'CF') {
    guardarDato(numeroDeTelefono, 'documento_cliente', 'CF');
    siguientePaso(numeroDeTelefono, PASOS.FLUJO_CONCEPTO);
    await enviarTexto(numeroDeTelefono, MENSAJES.PREGUNTA_CONCEPTO);
    return;
  }

  if (!validarDocumento(doc)) {
    await enviarTexto(numeroDeTelefono,
      '❌ Documento inválido. CUIT 11 dígitos, DNI 8 dígitos, o CF.');
    return;
  }

  guardarDato(numeroDeTelefono, 'documento_cliente', doc);
  siguientePaso(numeroDeTelefono, PASOS.FLUJO_CONCEPTO);
  await enviarTexto(numeroDeTelefono, MENSAJES.PREGUNTA_CONCEPTO);
}

async function validarYGuardarConcepto(numeroDeTelefono, texto, usuario) {
  const concepto = texto.trim();

  if (concepto.length < 3) {
    await enviarTexto(numeroDeTelefono,
      '❌ Concepto muy corto. Describe qué se factura.');
    return;
  }

  guardarDato(numeroDeTelefono, 'concepto', concepto);
  siguientePaso(numeroDeTelefono, PASOS.FLUJO_IMPORTE);
  await enviarTexto(numeroDeTelefono,
    '💰 ¿Importe en pesos? (solo números, sin . ni ,)\n\nEj: 5000');
}

async function validarYGuardarImporte(numeroDeTelefono, texto, usuario) {
  const importe = parseFloat(texto.replace(/,/g, '.'));

  if (!validarImporte(importe)) {
    await enviarTexto(numeroDeTelefono,
      '❌ Importe inválido. Debe ser número > 0.\n\nEj: 5000 o 1500.50');
    return;
  }

  guardarDato(numeroDeTelefono, 'importe', importe.toString());
  siguientePaso(numeroDeTelefono, PASOS.CONFIRMACION_FACTURA);

  const conversacion = obtenerEstado(numeroDeTelefono);
  const datosActuales = JSON.parse(conversacion.datos || '{}');

  await enviarTexto(numeroDeTelefono,
    `✅ Confirmá estos datos:\n\n• Cliente: ${datosActuales.razon_social_cliente}\n• Documento: ${datosActuales.documento_cliente}\n• Concepto: ${datosActuales.concepto}\n• Importe: $${datosActuales.importe}\n\nResponde SI para crear factura o NO para empezar de nuevo.`);
}

// ===== CONFIRMACIÓN =====

async function confirmarFactura(numeroDeTelefono, textoNorm, usuario) {
  if (textoNorm === 'SI' || textoNorm === 'SÍ') {
    // Crear factura (delegar a otro módulo)
    logger.info(`✅ Factura confirmada para ${numeroDeTelefono}`);
    await enviarTexto(numeroDeTelefono,
      '✅ Factura creada.\n\n🔗 Descargá tu PDF en el panel.');
    limpiarConversacion(numeroDeTelefono);
    await mostrarMenuPrincipal(numeroDeTelefono, usuario.nombre);
    return;
  }

  if (textoNorm === 'NO') {
    limpiarConversacion(numeroDeTelefono);
    await enviarTexto(numeroDeTelefono,
      'Cancelado. Volvemos al menú.');
    await mostrarMenuPrincipal(numeroDeTelefono, usuario.nombre);
    return;
  }

  await enviarTexto(numeroDeTelefono,
    '❌ Respondé SI o NO');
}

// ===== MENÚ PRINCIPAL =====

async function procesarMenuPrincipal(numeroDeTelefono, textoNorm, usuario) {
  if (textoNorm === '1') {
    // Nueva factura
    siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE);
    await enviarTexto(numeroDeTelefono,
      '📋 Nueva factura.\n\n¿A nombre de quién va?');
    return;
  }

  if (textoNorm === '2') {
    await enviarTexto(numeroDeTelefono,
      '📊 Función no disponible aún.');
    return;
  }

  if (textoNorm === '3') {
    await enviarTexto(numeroDeTelefono,
      `👤 Tus datos:\n\nRazón Social: ${usuario.razon_social}\nCUIT: ${usuario.cuit}\nCondición IVA: ${usuario.condicion_iva}`);
    return;
  }

  // Off-topic o input inválido
  await enviarTexto(numeroDeTelefono,
    '❌ No entiendo.\n\n1️⃣ Emitir factura\n2️⃣ Última factura\n3️⃣ Mis datos\n\nResponde 1, 2 o 3');
}
