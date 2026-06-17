// ==========================================
// FLUJO DE TEXTO - Procesar respuestas de texto plano
// ==========================================
// Usuario escribe texto, guardar datos, validar, confirmar

import {
  obtenerEstado,
  siguientePaso,
  guardarDato,
  obtenerDato,
  PASOS,
  mostrarMenuPrincipal,
  limpiarConversacion
} from '../bot/conversacion.js';
import { enviarMensajePorMeta } from '../bot/webhook.js';
import { MENSAJES } from '../bot/plantillas.js';
import { logger } from '../logger.js';
import { validarCUIT, validarDocumento, validarImporte } from '../facturacion/validaciones.js';
import { actualizarUsuario } from '../db.js';

export default async function procesarTexto(numeroDeTelefono, texto, usuario, paso, datos) {
  try {
    const textoNorm = texto.trim().toUpperCase();

    // ===== ONBOARDING =====

    if (paso === PASOS.ONBOARDING_CUIT) {
      return await onboardingCUIT(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.ONBOARDING_RAZON_SOCIAL) {
      return await onboardingRazonSocial(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.ONBOARDING_DOMICILIO) {
      return await onboardingDomicilio(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.ONBOARDING_CONDICION_IVA) {
      return await onboardingCondicionIVA(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.ONBOARDING_PUNTO_VENTA) {
      return await onboardingPuntoVenta(numeroDeTelefono, texto, usuario);
    }

    // ===== FLUJO FACTURA =====

    if (paso === PASOS.FLUJO_CLIENTE) {
      return await flujoCliente(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.FLUJO_DOCUMENTO) {
      return await flujoDocumento(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.FLUJO_CONCEPTO) {
      return await flujoConcepto(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.FLUJO_IMPORTE) {
      return await flujoImporte(numeroDeTelefono, texto, usuario);
    }

    if (paso === PASOS.CONFIRMACION_FACTURA) {
      return await confirmarFactura(numeroDeTelefono, texto, usuario);
    }

    // ===== MENÚ PRINCIPAL =====

    if (paso === PASOS.MENU_PRINCIPAL) {
      return await procesarMenuPrincipal(numeroDeTelefono, textoNorm, usuario);
    }

  } catch (error) {
    logger.error(`Error en procesarTexto: ${error.message}`);
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
  }
}

// ===== ONBOARDING FUNCTIONS =====

async function onboardingCUIT(numeroDeTelefono, texto, usuario) {
  const cuit = texto.replace(/\s/g, '').toUpperCase();

  if (!validarCUIT(cuit)) {
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.CUIT_INVALIDO);
    return;
  }

  guardarDato(numeroDeTelefono, 'cuit', cuit);
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_RAZON_SOCIAL);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_RAZON_SOCIAL);
}

async function onboardingRazonSocial(numeroDeTelefono, texto, usuario) {
  guardarDato(numeroDeTelefono, 'razon_social', texto.trim());
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_DOMICILIO);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_DOMICILIO);
}

async function onboardingDomicilio(numeroDeTelefono, texto, usuario) {
  guardarDato(numeroDeTelefono, 'domicilio', texto.trim());
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CONDICION_IVA);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_CONDICION_IVA);
}

async function onboardingCondicionIVA(numeroDeTelefono, texto, usuario) {
  const opcion = texto.trim().toUpperCase();
  let condicion = 'Monotributista';

  if (opcion === '2' || opcion === 'RESPONSABLE INSCRIPTO') {
    condicion = 'Responsable Inscripto';
  }

  guardarDato(numeroDeTelefono, 'condicion_iva', condicion);
  siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_PUNTO_VENTA);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_PUNTO_VENTA);
}

async function onboardingPuntoVenta(numeroDeTelefono, texto, usuario) {
  const textoNorm = texto.trim().toUpperCase();

  if (textoNorm.includes('NO LO TENGO') || textoNorm.includes('NO TENGO')) {
    siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_PUNTO_VENTA);
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.NO_TENGO_PUNTO_VENTA);
    return;
  }

  const puntoVenta = parseInt(texto.trim());

  if (isNaN(puntoVenta) || puntoVenta < 1) {
    await enviarMensajePorMeta(numeroDeTelefono, 'Número de punto de venta inválido. Intentá de nuevo.');
    return;
  }

  // Guardar datos en BD
  const conversacion = obtenerEstado(numeroDeTelefono);
  const datosOnboarding = JSON.parse(conversacion.datos);

  actualizarUsuario(usuario.id, {
    cuit: datosOnboarding.cuit,
    razon_social: datosOnboarding.razon_social,
    domicilio: datosOnboarding.domicilio,
    condicion_iva: datosOnboarding.condicion_iva,
    punto_venta: puntoVenta,
    nombre: datosOnboarding.razon_social
  });

  limpiarConversacion(numeroDeTelefono);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.ONBOARDING_COMPLETO);
}

// ===== FLUJO FACTURA FUNCTIONS =====

async function flujoCliente(numeroDeTelefono, texto, usuario) {
  guardarDato(numeroDeTelefono, 'razon_social_cliente', texto.trim());
  siguientePaso(numeroDeTelefono, PASOS.FLUJO_DOCUMENTO);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_DOCUMENTO);
}

async function flujoDocumento(numeroDeTelefono, texto, usuario) {
  const doc = texto.replace(/\s/g, '').toUpperCase();

  if (!validarDocumento(doc)) {
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.CUIT_INVALIDO);
    return;
  }

  guardarDato(numeroDeTelefono, 'documento_cliente', doc);
  siguientePaso(numeroDeTelefono, PASOS.FLUJO_CONCEPTO);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_CONCEPTO);
}

async function flujoConcepto(numeroDeTelefono, texto, usuario) {
  guardarDato(numeroDeTelefono, 'concepto', texto.trim());
  siguientePaso(numeroDeTelefono, PASOS.FLUJO_IMPORTE);
  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_IMPORTE);
}

async function flujoImporte(numeroDeTelefono, texto, usuario) {
  const importe = parseInt(texto.replace(/[^0-9]/g, ''));

  if (!validarImporte(importe)) {
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.IMPORTE_INVALIDO);
    return;
  }

  guardarDato(numeroDeTelefono, 'importe', importe);
  siguientePaso(numeroDeTelefono, PASOS.CONFIRMACION_FACTURA);

  // Mostrar confirmación
  const conversacion = obtenerEstado(numeroDeTelefono);
  const datos = JSON.parse(conversacion.datos);

  await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.CONFIRMACION_FACTURA(datos));
}

async function confirmarFactura(numeroDeTelefono, texto, usuario) {
  const respuesta = texto.trim().toUpperCase();

  if (respuesta === 'SI' || respuesta === 'S') {
    const { default: emitirFactura } = await import('./confirmacion.js');
    await emitirFactura(numeroDeTelefono, usuario);

  } else if (respuesta === 'NO' || respuesta === 'N') {
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.CONFIRMACION_TEXTO_MALO);
    siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE, {});

  } else {
    await enviarMensajePorMeta(numeroDeTelefono, 'Respondé SI o NO');
  }
}

// ===== PROCESAR MENU PRINCIPAL =====

async function procesarMenuPrincipal(numeroDeTelefono, textoNorm, usuario) {
  if (textoNorm === '1' || textoNorm.includes('FACTURA')) {
    // Emitir factura
    siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE, {});
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_CLIENTE);

  } else if (textoNorm === '2' || textoNorm.includes('ÚLTIMA')) {
    // Ver última factura
    // TODO: Obtener última factura y mostrar

  } else if (textoNorm === '3' || textoNorm.includes('DATOS')) {
    // Ver mis datos
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.MIS_DATOS(usuario));

  } else {
    await mostrarMenuPrincipal(numeroDeTelefono, usuario);
  }
}
