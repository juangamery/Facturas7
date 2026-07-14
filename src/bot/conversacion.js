// ==========================================
// MÁQUINA DE ESTADOS - Conversación WhatsApp
// ==========================================
// Gestiona flujos de conversación con detección de intención
// Estados: menu_principal, onboarding_*, flujo_factura, etc

import {
  obtenerConversacion,
  guardarConversacion,
  borrarConversacion,
  obtenerUsuario,
  obtenerFacturasDeUsuario,
} from '../db.js';
import { logger } from '../logger.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { validarCUIT } from '../facturacion/validaciones.js';

// ==========================================
// PASOS / ESTADOS DE LA CONVERSACIÓN
// ==========================================

export const PASOS = {
  // Menu principal
  MENU_PRINCIPAL: 'menu_principal',

  // Onboarding
  ONBOARDING_CUIT: 'onboarding_cuit',
  ONBOARDING_RAZON_SOCIAL: 'onboarding_rs',
  ONBOARDING_DOMICILIO: 'onboarding_domicilio',
  ONBOARDING_CONDICION_IVA: 'onboarding_condicion_iva',
  ONBOARDING_PUNTO_VENTA: 'onboarding_punto_venta',
  ONBOARDING_CONFIRMACION: 'onboarding_confirmacion',

  // Flujo factura por texto
  FACTURA_NOMBRE_CLIENTE: 'factura_nombre_cliente',
  FACTURA_DOCUMENTO_CLIENTE: 'factura_documento_cliente',
  FACTURA_CONCEPTO: 'factura_concepto',
  FACTURA_IMPORTE: 'factura_importe',
  FACTURA_CONFIRMACION: 'factura_confirmacion',

  // Flujo factura por imagen
  FACTURA_IMAGEN_ANALIZAR: 'factura_imagen_analizar',
  FACTURA_IMAGEN_CONFIRMACION: 'factura_imagen_confirmacion',

  // Flujo factura por audio
  FACTURA_AUDIO_PROCESAR: 'factura_audio_procesar',
  FACTURA_AUDIO_CONFIRMACION: 'factura_audio_confirmacion',

  // Ver última factura
  VER_ULTIMA_FACTURA: 'ver_ultima_factura',

  // Ver mis datos
  VER_MIS_DATOS: 'ver_mis_datos',
};

// ==========================================
// FUNCIONES BÁSICAS DE CONVERSACIÓN
// ==========================================

// Obtener estado actual de la conversación
export async function obtenerEstado(numeroDeTelefono) {
  return await obtenerConversacion(numeroDeTelefono);
}

// Avanzar al siguiente paso guardando datos
export async function siguientePaso(numeroDeTelefono, nuevoPaso, datos = {}) {
  const conv = await obtenerConversacion(numeroDeTelefono);
  const datosActuales = conv?.datos ? JSON.parse(conv.datos) : {};
  const datosFinales = { ...datosActuales, ...datos };
  await guardarConversacion(numeroDeTelefono, nuevoPaso, datosFinales);
  logger.debug(`[CONVERSACION] ${numeroDeTelefono} → ${nuevoPaso}`);
}

// Guardar un dato específico en la conversación
export async function guardarDato(numeroDeTelefono, clave, valor) {
  const conv = await obtenerConversacion(numeroDeTelefono);
  const datos = conv?.datos ? JSON.parse(conv.datos) : {};
  datos[clave] = valor;
  await guardarConversacion(
    numeroDeTelefono,
    conv?.paso || PASOS.MENU_PRINCIPAL,
    datos
  );
  logger.debug(`[DATO] ${numeroDeTelefono}: ${clave} = ${valor}`);
}

// Obtener un dato de la conversación
export async function obtenerDato(numeroDeTelefono, clave) {
  const conv = await obtenerConversacion(numeroDeTelefono);
  if (!conv) return null;
  const datos = JSON.parse(conv.datos || '{}');
  return datos[clave] || null;
}

// Limpiar conversación (reset)
export async function limpiarConversacion(numeroDeTelefono) {
  await borrarConversacion(numeroDeTelefono);
  logger.info(`[CONVERSACION] Limpiada: ${numeroDeTelefono}`);
}

// ==========================================
// DETECCIÓN DE INTENCIÓN
// ==========================================

// Detecta qué quiere hacer el usuario basándose en palabras clave
export function detectarIntencion(texto) {
  const t = texto.toLowerCase().trim();

  if (PLANTILLAS.PALABRAS_FACTURA.some((p) => t.includes(p))) {
    return 'FACTURA';
  }
  if (PLANTILLAS.PALABRAS_ULTIMA.some((p) => t.includes(p))) {
    return 'ULTIMA_FACTURA';
  }
  if (PLANTILLAS.PALABRAS_DATOS.some((p) => t.includes(p))) {
    return 'MIS_DATOS';
  }
  if (PLANTILLAS.PALABRAS_CANCELAR.some((p) => t.includes(p))) {
    return 'CANCELAR';
  }

  return null;
}

// Verifica si el texto es confirmación positiva
export function esConfirmacionSI(texto) {
  return PLANTILLAS.PALABRAS_SI.some((p) =>
    texto.toLowerCase().includes(p)
  );
}

// Verifica si el texto es confirmación negativa
export function esConfirmacionNO(texto) {
  return PLANTILLAS.PALABRAS_NO.some((p) =>
    texto.toLowerCase().includes(p)
  );
}

// ==========================================
// MENÚ PRINCIPAL
// ==========================================

export async function mostrarMenuPrincipal(numeroDeTelefono, usuario) {
  try {
    // Si usuario no tiene CUIT, iniciar onboarding
    if (!usuario.cuit || !usuario.punto_venta) {
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CUIT);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
      return;
    }

    // Mostrar menú con datos del usuario
    await siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL);
    await enviarTexto(
      numeroDeTelefono,
      PLANTILLAS.menuPrincipal(usuario.nombre || 'amigo')
    );
  } catch (error) {
    logger.error(`[MENU_PRINCIPAL] Error: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

// ==========================================
// FLUJO ONBOARDING (paso por paso)
// ==========================================

export async function procesarOnboarding(
  numeroDeTelefono,
  texto,
  paso,
  datosActuales
) {
  try {
    if (paso === PASOS.ONBOARDING_CUIT) {
      // Validar CUIT
      if (!validarCUIT(texto)) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.CUIT_INVALIDO);
        return;
      }
      await guardarDato(numeroDeTelefono, 'cuit', texto);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_RAZON_SOCIAL);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.CUIT_VALIDO);
    } else if (paso === PASOS.ONBOARDING_RAZON_SOCIAL) {
      await guardarDato(numeroDeTelefono, 'razon_social', texto);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_DOMICILIO);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_DOMICILIO);
    } else if (paso === PASOS.ONBOARDING_DOMICILIO) {
      await guardarDato(numeroDeTelefono, 'domicilio', texto);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CONDICION_IVA);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CONDICION_IVA);
    } else if (paso === PASOS.ONBOARDING_CONDICION_IVA) {
      // Validar opción
      if (!['1', '2'].includes(texto.trim())) {
        await enviarTexto(
          numeroDeTelefono,
          PLANTILLAS.CONDICION_IVA_INVALIDA
        );
        return;
      }
      const condicion = texto.trim() === '1' ? 'Monotributista' : 'Responsable Inscripto';
      await guardarDato(numeroDeTelefono, 'condicion_iva', condicion);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_PUNTO_VENTA);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_PUNTO_VENTA);
    } else if (paso === PASOS.ONBOARDING_PUNTO_VENTA) {
      // Usuario dice NO → mostrar instrucciones
      if (esConfirmacionNO(texto)) {
        await enviarTexto(
          numeroDeTelefono,
          PLANTILLAS.INSTRUCCIONES_PUNTO_VENTA
        );
        return;
      }
      // Validar que sea número
      if (isNaN(parseInt(texto))) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_PUNTO_VENTA);
        return;
      }
      await guardarDato(numeroDeTelefono, 'punto_venta', texto);
      await siguientePaso(
        numeroDeTelefono,
        PASOS.ONBOARDING_CONFIRMACION,
        datosActuales
      );
      // Mostrar resumen para confirmar
      await enviarTexto(
        numeroDeTelefono,
        PLANTILLAS.onboardingCompleto(datosActuales)
      );
    } else if (paso === PASOS.ONBOARDING_CONFIRMACION) {
      if (esConfirmacionSI(texto)) {
        // TODO: Guardar datos en BD (usuarios table)
        await limpiarConversacion(numeroDeTelefono);
        await enviarTexto(
          numeroDeTelefono,
          '✅ Cuenta configurada. Escribí algo para ver el menú.'
        );
      } else if (esConfirmacionNO(texto)) {
        await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CUIT);
        await enviarTexto(
          numeroDeTelefono,
          PLANTILLAS.DATOS_INCORRECTOS_ONBOARDING
        );
      } else {
        await enviarTexto(numeroDeTelefono, 'Respondé SI o NO.');
      }
    }
  } catch (error) {
    logger.error(`[ONBOARDING] Error en paso ${paso}: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

// ==========================================
// FLUJO EMITIR FACTURA (por texto)
// ==========================================

export async function procesarFacturaTexto(
  numeroDeTelefono,
  texto,
  paso,
  datosActuales
) {
  try {
    if (paso === PASOS.FACTURA_NOMBRE_CLIENTE) {
      if (texto.length < 3) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_NOMBRE_CLIENTE);
        return;
      }
      await guardarDato(numeroDeTelefono, 'razon_social_cliente', texto);
      await siguientePaso(
        numeroDeTelefono,
        PASOS.FACTURA_DOCUMENTO_CLIENTE
      );
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_DOCUMENTO_CLIENTE);
    } else if (paso === PASOS.FACTURA_DOCUMENTO_CLIENTE) {
      // Validar documento (CUIT, DNI, CF)
      const doc = texto.toUpperCase().trim();
      if (
        !validarCUIT(doc) &&
        !doc.startsWith('DNI') &&
        doc !== 'CF'
      ) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.DOCUMENTO_INVALIDO);
        return;
      }
      await guardarDato(numeroDeTelefono, 'documento_cliente', doc);
      await siguientePaso(numeroDeTelefono, PASOS.FACTURA_CONCEPTO);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CONCEPTO);
    } else if (paso === PASOS.FACTURA_CONCEPTO) {
      if (texto.length < 3) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CONCEPTO);
        return;
      }
      await guardarDato(numeroDeTelefono, 'concepto', texto);
      await siguientePaso(numeroDeTelefono, PASOS.FACTURA_IMPORTE);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_IMPORTE);
    } else if (paso === PASOS.FACTURA_IMPORTE) {
      // Validar que sea número
      const importe = parseInt(texto);
      if (isNaN(importe) || importe <= 0) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.IMPORTE_INVALIDO);
        return;
      }
      await guardarDato(numeroDeTelefono, 'importe', importe);
      await siguientePaso(
        numeroDeTelefono,
        PASOS.FACTURA_CONFIRMACION,
        datosActuales
      );
      // Mostrar resumen
      await enviarTexto(
        numeroDeTelefono,
        PLANTILLAS.resumenFactura({
          tipo_comprobante: 'Factura C',
          ...datosActuales,
          importe,
        })
      );
    } else if (paso === PASOS.FACTURA_CONFIRMACION) {
      if (esConfirmacionSI(texto)) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.EMITIENDO_FACTURA);
        // TODO: Generar PDF, solicitar CAE, guardar en BD
        await limpiarConversacion(numeroDeTelefono);
      } else if (esConfirmacionNO(texto)) {
        await siguientePaso(
          numeroDeTelefono,
          PASOS.FACTURA_NOMBRE_CLIENTE
        );
        await enviarTexto(
          numeroDeTelefono,
          PLANTILLAS.DATOS_INCORRECTOS_FACTURA
        );
      } else {
        await enviarTexto(numeroDeTelefono, 'Respondé SI o NO.');
      }
    }
  } catch (error) {
    logger.error(`[FACTURA_TEXTO] Error en paso ${paso}: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

// ==========================================
// VER ÚLTIMA FACTURA
// ==========================================

export async function verUltimaFactura(numeroDeTelefono, usuario) {
  try {
    const facturas = await obtenerFacturasDeUsuario(usuario.id);
    if (!facturas || facturas.length === 0) {
      await enviarTexto(numeroDeTelefono, PLANTILLAS.SIN_FACTURAS);
      return;
    }
    const ultima = facturas[0];
    await enviarTexto(
      numeroDeTelefono,
      PLANTILLAS.ultimaFactura(ultima)
    );
    await limpiarConversacion(numeroDeTelefono);
  } catch (error) {
    logger.error(`[ULTIMA_FACTURA] Error: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

// ==========================================
// VER MIS DATOS
// ==========================================

export async function verMisDatos(numeroDeTelefono, usuario) {
  try {
    await enviarTexto(
      numeroDeTelefono,
      PLANTILLAS.verMisDatos(usuario)
    );
    await limpiarConversacion(numeroDeTelefono);
  } catch (error) {
    logger.error(`[MIS_DATOS] Error: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

// ==========================================
// CANCELAR FLUJO
// ==========================================

export async function cancelarOperacion(numeroDeTelefono) {
  try {
    await enviarTexto(numeroDeTelefono, PLANTILLAS.CANCELADO);
    await limpiarConversacion(numeroDeTelefono);
  } catch (error) {
    logger.error(`[CANCELAR] Error: ${error.message}`);
  }
}

// ==========================================
// TIMEOUT (inactividad 15 min)
// ==========================================

export async function procesarTimeout(numeroDeTelefono) {
  try {
    await enviarTexto(numeroDeTelefono, PLANTILLAS.TIMEOUT);
    await limpiarConversacion(numeroDeTelefono);
  } catch (error) {
    logger.error(`[TIMEOUT] Error: ${error.message}`);
  }
}
