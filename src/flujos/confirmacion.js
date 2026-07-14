// ==========================================
// FLUJO CONFIRMACIÓN - Emitir factura (CAE, PDF, envío)
// ==========================================
// 1. Validar datos finales
// 2. Solicitar CAE a Afip SDK
// 3. Generar PDF con pdfkit
// 4. Enviar PDF por WhatsApp
// 5. Incrementar contador de facturas

import path from 'path';
import { fileURLToPath } from 'url';
import {
  obtenerEstado,
  limpiarConversacion,
  mostrarMenuPrincipal
} from '../bot/conversacion.js';
import { enviarTexto, enviarDocumento } from '../whatsapp/mensajes.js';
import { MENSAJES } from '../bot/plantillas.js';
import { logger, logearError } from '../logger.js';
import { actualizarUsuario, crearFactura, obtenerUsuarioPorID } from '../db.js';
import { validarDatosFactura, solicitarCAE } from '../facturacion/factura.js';
import { generarPDFFactura } from '../facturacion/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function emitirFactura(numeroDeTelefono, usuario) {
  try {
    // Obtener datos de conversación
    const conversacion = await obtenerEstado(numeroDeTelefono);
    if (!conversacion) {
      await enviarTexto(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
      return;
    }

    const datos = JSON.parse(conversacion.datos);

    // ===== STEP 1: PREPARAR DATOS FINALES =====

    const datosFactura = {
      cuit: usuario.cuit,
      entorno: usuario.entorno || 'homologacion',
      punto_venta: usuario.punto_venta,
      razon_social_cliente: datos.razon_social_cliente,
      documento_cliente: datos.documento_cliente,
      concepto: datos.concepto,
      importe: datos.importe,
      condicion_venta: datos.condicion_venta || 'Contado',
      fecha_emision: new Date().toLocaleDateString('es-AR'),
      tipo_comprobante: 'Factura C',
      condicion_iva_cliente: '5', // 5 = Consumidor final por defecto
      // Datos del emisor (del usuario)
      cuit_emisor: usuario.cuit,
      razon_social_emisor: usuario.razon_social,
      domicilio_emisor: usuario.domicilio,
      condicion_iva_emisor: usuario.condicion_iva
    };

    // Validar datos
    const validacion = validarDatosFactura(datosFactura);
    if (!validacion.valido) {
      const erroresTexto = validacion.errores.join('\n');
      await enviarTexto(numeroDeTelefono, `❌ Errores:\n${erroresTexto}`);
      return;
    }

    // ===== STEP 2: SOLICITAR CAE A AFIP SDK =====

    await enviarTexto(numeroDeTelefono, MENSAJES.EMITIENDO_FACTURA);

    const caeDatos = await solicitarCAE(datosFactura);

    datosFactura.cae = caeDatos.cae;
    datosFactura.vencimiento_cae = caeDatos.vencimiento_cae;
    datosFactura.numero_factura = caeDatos.numero_comprobante;

    logger.info(`CAE obtenido: ${caeDatos.cae}`);

    // ===== STEP 3: GENERAR PDF =====

    const rutaPDF = await generarPDFFactura(datosFactura);
    logger.info(`PDF generado: ${rutaPDF}`);

    // ===== STEP 4: ENVIAR PDF =====

    // Meta sube el archivo local directamente (no por URL pública)
    await enviarDocumento(
      numeroDeTelefono,
      rutaPDF,
      `Factura_${datosFactura.numero_factura}.pdf`
    );

    // ===== STEP 5-6: GUARDAR EN BD + CONTADOR (no crítico) =====
    // Si falla la DB, el PDF ya se envió — no romper el flujo.
    try {
      await crearFactura(usuario.id, {
        numero_telefono: numeroDeTelefono,
        fecha_emision: datosFactura.fecha_emision,
        tipo_comprobante: datosFactura.tipo_comprobante,
        numero_factura: datosFactura.numero_factura,
        razon_social_cliente: datosFactura.razon_social_cliente,
        documento_cliente: datosFactura.documento_cliente,
        concepto: datosFactura.concepto,
        importe: datosFactura.importe,
        cae: datosFactura.cae,
        vencimiento_cae: datosFactura.vencimiento_cae,
        pdf_path: rutaPDF,
        origen: 'texto'
      });

      const usuarioActualizado = await obtenerUsuarioPorID(usuario.id);
      await actualizarUsuario(usuario.id, {
        facturas_mes_actual: (usuarioActualizado?.facturas_mes_actual || 0) + 1
      });
    } catch (dbErr) {
      logger.warn(`No se guardó factura en BD (PDF ya enviado): ${dbErr.message}`);
    }

    // ===== STEP 7: ENVIAR CONFIRMACIÓN =====

    await enviarTexto(
      numeroDeTelefono,
      MENSAJES.FACTURA_EMITIDA(datosFactura)
    );

    // Limpiar conversación
    await limpiarConversacion(numeroDeTelefono);

    // Mostrar menú principal de nuevo
    await mostrarMenuPrincipal(numeroDeTelefono, usuario);

    logger.info(`✅ Factura emitida exitosamente: ${datosFactura.numero_factura}`);

  } catch (error) {
    logearError(error, 'emitirFactura');

    // Enviar mensaje de error
    await enviarTexto(numeroDeTelefono, MENSAJES.ERROR_EMITIR);

    // Limpiar conversación para que vuelva a intentar
    await limpiarConversacion(numeroDeTelefono);
  }
}
