import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { enviarPorEvolution } from './webhook.js';
import { extraerDatos, validarNombre, validarTelefono, validarCUIT } from './parseo.js';

export async function procesarMensaje(numeroWhatsapp, contenido, tipo, messageId) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  let conversacion = db.prepare(
    'SELECT * FROM conversaciones_whatsapp WHERE numero_whatsapp = ?'
  ).get(numeroWhatsapp);

  if (!conversacion) {
    db.prepare(`
      INSERT INTO conversaciones_whatsapp
      (numero_whatsapp, estado, datos_temporales, creado_en, actualizado_en)
      VALUES (?, 'NUEVO', '{}', ?, ?)
    `).run(numeroWhatsapp, ahora, ahora);

    conversacion = { numero_whatsapp: numeroWhatsapp, estado: 'NUEVO', datos_temporales: '{}' };
  }

  const datos = JSON.parse(conversacion.datos_temporales || '{}');
  let nuevoEstado = conversacion.estado;
  let respuesta = '';

  switch (conversacion.estado) {
    case 'NUEVO':
      try {
        const { crearSuscripcion, obtenerLinkPago } = await import('../mercadopago/suscripcion.js');
        const suscripcion = await crearSuscripcion(numeroWhatsapp, process.env.MP_PLAN_ID || 'plan_default');
        const linkPago = await obtenerLinkPago(suscripcion.id);

        respuesta = `🎉 Bienvenido a Facturas7!\n\nServicio de facturación electrónica.\nCosto: $500/mes\n\n💳 Paga aquí:\n${linkPago}\n\nUna vez pagado, envía el comprobante de pago.`;

        datos.suscripcion_id = suscripcion.id;
        nuevoEstado = 'PENDIENTE_VERIFICACION';
      } catch (error) {
        logger.warn(`Error creando suscripción MP: ${error.message}`);
        respuesta = `🎉 Bienvenido a Facturas7!\n\nServicio de facturación electrónica.\nCosto: $500/mes\n\n💳 Link de pago:\nhttps://mercadopago.com.ar/...\n\nUna vez pagado, envía el comprobante.`;
        nuevoEstado = 'PENDIENTE_VERIFICACION';
      }
      break;

    case 'PENDIENTE_VERIFICACION':
      if (tipo === 'imagen' || tipo === 'audio') {
        const comprobante_id = guardarComprobante(numeroWhatsapp, contenido, tipo);
        datos.comprobante_id = comprobante_id;
        respuesta = `✅ Comprobante recibido.\n\nAguarda la verificación de nuestro equipo (puede tomar hasta 2 horas).`;
      } else {
        respuesta = `❌ Por favor envía una imagen o audio del comprobante de pago.`;
      }
      break;

    case 'ESPERANDO_NOMBRE':
      if (validarNombre(contenido)) {
        datos.nombre = contenido.trim();
        respuesta = `✓ Nombre: ${datos.nombre}\n\n¿Tu número de teléfono?`;
        nuevoEstado = 'ESPERANDO_TELEFONO';
      } else {
        respuesta = `❌ Nombre inválido. Ingresa solo letras.`;
      }
      break;

    case 'ESPERANDO_TELEFONO':
      if (validarTelefono(contenido)) {
        datos.telefono = contenido.trim();
        respuesta = `✓ Teléfono: ${datos.telefono}\n\n¿Tu CUIT? (escribe NO para saltear)`;
        nuevoEstado = 'ESPERANDO_CUIT';
      } else {
        respuesta = `❌ Teléfono inválido. Ej: +5491234567890`;
      }
      break;

    case 'ESPERANDO_CUIT':
      if (contenido.toUpperCase() === 'NO') {
        datos.cuit = null;
        respuesta = crearResumenConfirmacion(datos);
        nuevoEstado = 'CONFIRMANDO';
      } else if (validarCUIT(contenido)) {
        datos.cuit = contenido.trim();
        respuesta = crearResumenConfirmacion(datos);
        nuevoEstado = 'CONFIRMANDO';
      } else {
        respuesta = `❌ CUIT inválido. Formato: 20123456789 o NO`;
      }
      break;

    case 'CONFIRMANDO':
      if (contenido.toUpperCase() === 'SÍ' || contenido.toUpperCase() === 'SI') {
        const usuario_id = crearUsuario(numeroWhatsapp, datos);
        respuesta = `✅ ¡Bienvenido ${datos.nombre}!\n\nYa puedes acceder a la plataforma.\n\n👉 https://localhost:5173\n\nDe aquí en adelante, envíame:\n📝 Texto o 🎙️ Audio con lo que factures.\n\nEj: "Asesoría contable - $5000"`;
        nuevoEstado = 'LISTO_FACTURAR';
      } else if (contenido.toUpperCase() === 'NO') {
        respuesta = `Ok, comenzamos de nuevo. ¿Tu nombre?`;
        nuevoEstado = 'ESPERANDO_NOMBRE';
        datos.nombre = null;
        datos.telefono = null;
        datos.cuit = null;
      } else {
        respuesta = `Responde con SÍ o NO`;
      }
      break;

    case 'LISTO_FACTURAR':
      if (datos.factura_pendiente?.estado === 'CONFIRMANDO') {
        if (contenido.toUpperCase() === 'SÍ' || contenido.toUpperCase() === 'SI') {
          respuesta = await confirmarYGenerarFactura(numeroWhatsapp, datos);
          datos.factura_pendiente = null;
        } else if (contenido.toUpperCase() === 'NO') {
          respuesta = `Ok, envía otro concepto.`;
          datos.factura_pendiente = null;
        } else {
          respuesta = `Responde con SÍ o NO`;
        }
      } else {
        respuesta = await procesarFactura(numeroWhatsapp, contenido, tipo, datos);
      }
      break;

    default:
      respuesta = `Error en estado. Reinicia: /start`;
  }

  db.prepare(`
    UPDATE conversaciones_whatsapp
    SET estado = ?, datos_temporales = ?, actualizado_en = ?
    WHERE numero_whatsapp = ?
  `).run(nuevoEstado, JSON.stringify(datos), ahora, numeroWhatsapp);

  if (respuesta) {
    await enviarPorEvolution(numeroWhatsapp, respuesta);
  }
}

function crearResumenConfirmacion(datos) {
  return `📋 Resumen:\n\n👤 Nombre: ${datos.nombre}\n📱 Teléfono: ${datos.telefono}\n🏛️ CUIT: ${datos.cuit || 'No proporcionado'}\n\n¿Confirmas? (SÍ/NO)`;
}

function crearUsuario(numeroWhatsapp, datos) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);
  const vencimiento = ahora + (30 * 24 * 60 * 60);

  db.prepare(`
    INSERT INTO usuarios
    (numero_telefono, nombre, cuit, plan, activo, fecha_registro, fecha_vencimiento)
    VALUES (?, ?, ?, 'basico', 1, ?, ?)
  `).run(numeroWhatsapp, datos.nombre, datos.cuit || null, ahora, vencimiento);

  const usuario = db.prepare('SELECT id FROM usuarios WHERE numero_telefono = ?').get(numeroWhatsapp);
  return usuario.id;
}

function guardarComprobante(numeroWhatsapp, contenido, tipo) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO comprobantes_pago
    (numero_whatsapp, tipo, contenido_texto, creado_en)
    VALUES (?, ?, ?, ?)
  `).run(numeroWhatsapp, tipo, contenido, ahora);

  const comprobante = db.prepare(
    'SELECT id FROM comprobantes_pago WHERE numero_whatsapp = ? ORDER BY id DESC LIMIT 1'
  ).get(numeroWhatsapp);

  return comprobante.id;
}

async function procesarFactura(numeroWhatsapp, contenido, tipo, datos) {
  const db = getDB();

  try {
    // Obtener usuario
    const usuario = db.prepare('SELECT * FROM usuarios WHERE numero_telefono = ?').get(numeroWhatsapp);
    if (!usuario) {
      return `❌ Usuario no encontrado. Registrate primero.`;
    }

    // Parsear datos factura
    let concepto = contenido;
    let importe = null;

    const regexImporte = /[\$]?\s?(\d+(?:[.,]\d{2})?)/;
    const match = contenido.match(regexImporte);

    if (match) {
      importe = parseFloat(match[1].replace(',', '.'));
      concepto = contenido.replace(regexImporte, '').trim();
    }

    if (!concepto || !importe) {
      return `❌ Formato inválido. Ej: "Asesoría contable - $5000"`;
    }

    // Estado temporal para confirmar
    datos.factura_pendiente = {
      concepto,
      importe,
      estado: 'CONFIRMANDO'
    };

    db.prepare(`
      UPDATE conversaciones_whatsapp
      SET datos_temporales = ?
      WHERE numero_whatsapp = ?
    `).run(JSON.stringify(datos), numeroWhatsapp);

    return `📝 Factura:\n\n📌 Concepto: ${concepto}\n💰 Importe: $${importe.toFixed(2)}\n\n¿Confirmas? (SÍ/NO)`;

  } catch (error) {
    logger.error(`Error procesando factura: ${error.message}`);
    return `❌ Error procesando factura.`;
  }
}

async function confirmarYGenerarFactura(numeroWhatsapp, datos) {
  const db = getDB();

  try {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE numero_telefono = ?').get(numeroWhatsapp);
    if (!usuario) {
      return `❌ Usuario no encontrado.`;
    }

    const factura = datos.factura_pendiente;
    const ahora = Math.floor(Date.now() / 1000);
    const numero = `${ahora}`;

    // Solicitar CAE de Afip
    let cae = 'PENDIENTE';
    let vencimientoCae = '';

    try {
      const { solicitarCAE } = await import('../afip/cae.js');
      const resultadoCAE = await solicitarCAE({
        numero_factura: numero,
        razon_social: usuario.razon_social || usuario.nombre,
        cuit: usuario.cuit,
        importe: factura.importe,
        concepto: factura.concepto
      });

      if (resultadoCAE) {
        cae = resultadoCAE.cae;
        vencimientoCae = resultadoCAE.vencimiento;
      }
    } catch (caeError) {
      logger.warn(`CAE no obtenido: ${caeError.message}`);
    }

    // Guardar factura en BD
    db.prepare(`
      INSERT INTO facturas
      (usuario_id, numero_telefono, fecha_emision, tipo_comprobante, numero_factura,
       razon_social_cliente, documento_cliente, concepto, importe, cae, vencimiento_cae,
       pdf_path, origen, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario.id,
      numeroWhatsapp,
      new Date().toISOString().split('T')[0],
      'Factura C',
      numero,
      usuario.razon_social || usuario.nombre,
      usuario.cuit || 'CF',
      factura.concepto,
      factura.importe,
      cae,
      vencimientoCae,
      '',
      'whatsapp',
      ahora
    );

    // Generar PDF
    const { generarPDFFactura } = await import('../facturacion/pdf.js');
    let pdfPath = '';

    try {
      pdfPath = await generarPDFFactura({
        numero_factura: numero,
        fecha_emision: new Date().toISOString().split('T')[0],
        razon_social_cliente: usuario.razon_social || usuario.nombre,
        documento_cliente: usuario.cuit || 'CF',
        domicilio_cliente: usuario.domicilio || '',
        razon_social_emisor: usuario.razon_social || usuario.nombre,
        cuit_emisor: usuario.cuit,
        domicilio_emisor: usuario.domicilio,
        condicion_iva: usuario.condicion_iva,
        concepto: factura.concepto,
        importe: factura.importe,
        tipo_comprobante: 'Factura C',
        punto_venta: usuario.punto_venta || 1,
        cae: 'PENDIENTE'
      });

      if (pdfPath) {
        db.prepare('UPDATE facturas SET pdf_path = ? WHERE numero_factura = ?').run(pdfPath, numero);
      }
    } catch (pdfError) {
      logger.warn(`PDF no generado: ${pdfError.message}`);
    }

    // Enviar PDF por WhatsApp
    if (pdfPath) {
      const { enviarPDF } = await import('./send.js');
      try {
        await enviarPDF(numeroWhatsapp, pdfPath, `factura_${numero}.pdf`);
      } catch (sendError) {
        logger.warn(`No se envió PDF: ${sendError.message}`);
      }
    }

    logger.info(`Factura ${numero} generada para ${numeroWhatsapp}`);
    return `✅ Factura #${numero} generada y enviada.\n\n📄 Revisa tu correo o descárgala desde la plataforma.`;

  } catch (error) {
    logger.error(`Error generando factura: ${error.message}`);
    return `❌ Error al generar factura.`;
  }
}
