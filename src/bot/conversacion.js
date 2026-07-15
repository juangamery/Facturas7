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
  actualizarUsuario,
  obtenerFacturasDeUsuario,
  getDB,
} from '../db.js';
import { logger, logearError } from '../logger.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { validarCUIT } from '../facturacion/validaciones.js';
import { generarPDFFactura } from '../facturacion/pdf.js';
import { solicitarCAE } from '../facturacion/factura.js';

// ==========================================
// PASOS / ESTADOS DE LA CONVERSACIÓN
// ==========================================

export const PASOS = {
  // Menu principal
  MENU_PRINCIPAL: 'menu_principal',

  // Registro (usuario nuevo sin acceso)
  REG_METODO: 'reg_metodo',
  REG_NOMBRE: 'reg_nombre',
  REG_CUIT: 'reg_cuit',
  REG_EMAIL: 'reg_email',
  REG_TODO_JUNTO: 'reg_todo_junto',

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
        // Guardar datos acumulados en BD
        const usuario = await obtenerUsuario(numeroDeTelefono);
        await actualizarUsuario(usuario.id, {
          cuit: datosActuales.cuit,
          razon_social: datosActuales.razon_social,
          domicilio: datosActuales.domicilio,
          condicion_iva: datosActuales.condicion_iva,
          punto_venta: datosActuales.punto_venta,
        });
        await limpiarConversacion(numeroDeTelefono);
        await siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL);
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
  datosActuales,
  usuario
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

        // Emitir factura
        try {
          const ahora = Math.floor(Date.now() / 1000);

          // Armar datos para PDF + CAE
          const datosFactura = {
            numero_factura: `${datosActuales.punto_venta || 1}-${Math.floor(Math.random() * 100000)}`,
            fecha_emision: new Date().toISOString().split('T')[0],
            tipo_comprobante: 'Factura C',
            razon_social_cliente: datosActuales.razon_social_cliente,
            documento_cliente: datosActuales.documento_cliente || 'CF',
            concepto: datosActuales.concepto,
            importe: datosActuales.importe,
            punto_venta: datosActuales.punto_venta || usuario.punto_venta || 1,
            // Datos AFIP
            cuit: usuario.cuit,
            condicion_iva_cliente: 5, // 5=Consumidor Final (por defecto)
            concepto_afip: 1, // 1=Productos
            entorno: process.env.AFIPSDK_ENTORNO || 'homologacion',
          };

          // Generar PDF
          let pdfPath;
          try {
            pdfPath = await generarPDFFactura({
              ...datosFactura,
              domicilio_cliente: '',
              razon_social_emisor: usuario.razon_social,
              cuit_emisor: usuario.cuit,
              domicilio_emisor: usuario.domicilio,
              condicion_iva: usuario.condicion_iva,
              cae: 'PENDIENTE',
            });
          } catch (pdfError) {
            logger.warn(`PDF falla: ${pdfError.message}`);
          }

          // Solicitar CAE a AFIP
          let cae = 'PENDIENTE';
          let vencimientoCae = '';
          try {
            const respCAE = await solicitarCAE(datosFactura);
            cae = respCAE?.cae || 'PENDIENTE';
            vencimientoCae = respCAE?.vencimiento_cae || '';
          } catch (caeError) {
            logearError(caeError, 'solicitarCAE');
          }

          // Guardar factura en BD
          await getDB().from('facturas').insert({
            usuario_id: usuario.id,
            numero_telefono: numeroDeTelefono,
            fecha_emision: datosFactura.fecha_emision,
            tipo_comprobante: datosFactura.tipo_comprobante,
            numero_factura: datosFactura.numero_factura,
            razon_social_cliente: datosFactura.razon_social_cliente,
            documento_cliente: datosFactura.documento_cliente,
            concepto: datosFactura.concepto,
            importe: datosFactura.importe,
            cae,
            vencimiento_cae: vencimientoCae,
            pdf_path: pdfPath || '',
            origen: 'whatsapp',
            creado_en: ahora,
          });

          // Confirmación al usuario
          await enviarTexto(
            numeroDeTelefono,
            PLANTILLAS.facturaEmitida({
              tipo_comprobante: datosFactura.tipo_comprobante,
              numero_factura: datosFactura.numero_factura,
              cae,
              vencimiento_cae: vencimientoCae,
            })
          );

          await limpiarConversacion(numeroDeTelefono);
        } catch (error) {
          logearError(error, 'Emitir factura');
          await enviarTexto(
            numeroDeTelefono,
            PLANTILLAS.errorEmitirFactura(error.message)
          );
          await limpiarConversacion(numeroDeTelefono);
        }
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

// ==========================================
// PROCESAR AUDIO (Groq transcripción)
// ==========================================

export async function procesarAudioConversacional(
  numeroDeTelefono,
  audioPath,
  usuario
) {
  try {
    // Enviar mensaje "procesando"
    await enviarTexto(numeroDeTelefono, PLANTILLAS.AUDIO_RECIBIDO);

    // Validar Groq configurado
    if (!process.env.GROQ_API_KEY) {
      logger.warn('GROQ_API_KEY no configurada');
      await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_AUDIO);
      return;
    }

    // Transcribir audio con Groq Whisper
    let transcripcion = '';
    try {
      const Groq = (await import('groq-sdk')).default;
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
        defaultHeaders: { 'user-agent': 'Facturas7-Bot/1.0' }
      });

      const fs = (await import('fs')).default;

      // Leer archivo y crear FormData para Groq
      const audioBuffer = fs.readFileSync(audioPath);
      const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

      logger.info(`📝 Enviando audio a Groq (${audioPath})`);
      const response = await groq.audio.transcriptions.create({
        file: file,
        model: 'whisper-large-v3-turbo',
        language: 'es',
        temperature: 0.0,
      });

      transcripcion = response.text || '';
      if (!transcripcion) {
        throw new Error('Groq retornó transcripción vacía');
      }

      logger.info(`✅ [AUDIO] Transcrito: ${transcripcion.substring(0, 100)}`);
    } catch (groqError) {
      logger.error(`❌ [GROQ] Transcripción falla: ${groqError.message}`);
      await enviarTexto(numeroDeTelefono, `❌ Error transcribiendo: ${groqError.message}`);
      return;
    }

    // Procesar texto transcrito como flujo normal
    if (!transcripcion || transcripcion.length < 2) {
      await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_AUDIO);
      return;
    }

    // Obtener estado de conversación
    const conversacion = await obtenerEstado(numeroDeTelefono);
    const paso = conversacion?.paso;
    const datosActuales = conversacion?.datos
      ? JSON.parse(conversacion.datos)
      : {};

    // Aplicar misma lógica que texto
    if (!conversacion || paso === PASOS.MENU_PRINCIPAL) {
      // En menú: detectar intención del audio
      const intencion = detectarIntencion(transcripcion);

      if (intencion === 'FACTURA') {
        await siguientePaso(numeroDeTelefono, PASOS.FACTURA_NOMBRE_CLIENTE);
        await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_NOMBRE_CLIENTE);
        return;
      }

      if (intencion === 'ULTIMA_FACTURA') {
        await verUltimaFactura(numeroDeTelefono, usuario);
        return;
      }

      if (intencion === 'MIS_DATOS') {
        await verMisDatos(numeroDeTelefono, usuario);
        return;
      }

      // Default
      await mostrarMenuPrincipal(numeroDeTelefono, usuario);
      return;
    }

    // En flujo: procesar como texto normal
    if (
      paso === PASOS.ONBOARDING_CUIT ||
      paso === PASOS.ONBOARDING_RAZON_SOCIAL ||
      paso === PASOS.ONBOARDING_DOMICILIO ||
      paso === PASOS.ONBOARDING_CONDICION_IVA ||
      paso === PASOS.ONBOARDING_PUNTO_VENTA ||
      paso === PASOS.ONBOARDING_CONFIRMACION
    ) {
      await procesarOnboarding(
        numeroDeTelefono,
        transcripcion,
        paso,
        datosActuales
      );
      return;
    }

    if (
      paso === PASOS.FACTURA_NOMBRE_CLIENTE ||
      paso === PASOS.FACTURA_DOCUMENTO_CLIENTE ||
      paso === PASOS.FACTURA_CONCEPTO ||
      paso === PASOS.FACTURA_IMPORTE ||
      paso === PASOS.FACTURA_CONFIRMACION
    ) {
      await procesarFacturaTexto(numeroDeTelefono, transcripcion, paso, datosActuales);
      return;
    }
  } catch (error) {
    logearError(error, `Audio ${numeroDeTelefono}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}
