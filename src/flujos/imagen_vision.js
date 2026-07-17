// ==========================================
// PROCESAMIENTO DE IMÁGENES CON GEMINI VISION
// ==========================================
// Extrae datos de factura de imágenes (fotos de recibos, facturas, etc)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger, logearError } from '../logger.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { siguientePaso, guardarDato, obtenerEstado, PASOS, obtenerDato } from '../bot/conversacion.js';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

export async function procesarImagenFactura(numeroDeTelefono, imagenPath, usuario) {
  try {
    await enviarTexto(numeroDeTelefono, '📸 Analizando imagen...');

    // Leer imagen
    if (!fs.existsSync(imagenPath)) {
      logger.warn(`Imagen no existe: ${imagenPath}`);
      await enviarTexto(numeroDeTelefono, '❌ No pude leer imagen');
      return;
    }

    const imagenBase64 = fs.readFileSync(imagenPath).toString('base64');
    const ext = path.extname(imagenPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    // Enviar a Gemini Vision
    // gemini-1.5-flash y luego gemini-2.5-flash fueron retirados por Google
    // uno tras otro (confirmado en logs: 404 "not found" y después "no
    // longer available to new users"). Usamos el alias 'gemini-flash-latest'
    // que Google mantiene apuntando siempre al modelo flash vigente, para
    // no perseguir esto de nuevo cada vez que deprecan una versión puntual.
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const prompt = `Analiza esta imagen de comprobante/factura/recibo y extrae:
- nombre_cliente: nombre de quien recibe la factura
- documento: CUIT, DNI, o CF (consumidor final)
- concepto: qué es (ej: servicios, productos, etc)
- importe: monto numérico sin símbolo

Devuelve JSON válido:
{
  "nombre_cliente": "...",
  "documento": "...",
  "concepto": "...",
  "importe": 0
}

Si algo no está claro, pon null. Sé preciso.`;

    const response = await model.generateContent([
      {
        inlineData: {
          data: imagenBase64,
          mimeType: mimeType,
        },
      },
      prompt,
    ]);

    const textoRespuesta = response.response.text();
    logger.info(`📸 [GEMINI] Respuesta: ${textoRespuesta.substring(0, 200)}`);

    // Parsear JSON
    const jsonMatch = textoRespuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await enviarTexto(numeroDeTelefono, '❌ No pude extraer datos de imagen. Mandá foto más clara o los datos manualmente.');
      return;
    }

    const datos = JSON.parse(jsonMatch[0]);

    // Guardar en conversación
    const conv = await obtenerEstado(numeroDeTelefono);
    const datosActuales = conv?.datos ? JSON.parse(conv.datos) : {};

    if (datos.nombre_cliente) {
      await guardarDato(numeroDeTelefono, 'razon_social_cliente', datos.nombre_cliente);
      datosActuales.razon_social_cliente = datos.nombre_cliente;
    }
    if (datos.documento) {
      await guardarDato(numeroDeTelefono, 'documento_cliente', datos.documento);
      datosActuales.documento_cliente = datos.documento;
    }
    if (datos.concepto) {
      await guardarDato(numeroDeTelefono, 'concepto', datos.concepto);
      datosActuales.concepto = datos.concepto;
    }
    if (datos.importe) {
      await guardarDato(numeroDeTelefono, 'importe', datos.importe);
      datosActuales.importe = datos.importe;
    }

    // Detectar campos faltantes
    const faltantes = [];
    if (!datosActuales.razon_social_cliente) faltantes.push('nombre_cliente');
    if (!datosActuales.documento_cliente) faltantes.push('documento_cliente');
    if (!datosActuales.concepto) faltantes.push('concepto');
    if (!datosActuales.importe) faltantes.push('importe');

    if (faltantes.length === 0) {
      // Completo → confirmación
      await siguientePaso(numeroDeTelefono, PASOS.FACTURA_CONFIRMACION, datosActuales);
      const PLANTILLAS_MOD = await import('../whatsapp/plantillas.js');
      await enviarTexto(
        numeroDeTelefono,
        PLANTILLAS_MOD.resumenFactura({
          tipo_comprobante: 'Factura C',
          ...datosActuales,
        })
      );
    } else {
      // Parcial → mostrar qué extrajo y preguntar faltantes
      let resumen = '📋 Extraje de la imagen:\n';
      if (datosActuales.razon_social_cliente) resumen += `✅ Cliente: ${datosActuales.razon_social_cliente}\n`;
      if (datosActuales.documento_cliente) resumen += `✅ Documento: ${datosActuales.documento_cliente}\n`;
      if (datosActuales.concepto) resumen += `✅ Concepto: ${datosActuales.concepto}\n`;
      if (datosActuales.importe) resumen += `✅ Importe: $${datosActuales.importe}\n`;

      resumen += `\nMe faltan: ${faltantes.map(f => f.replace('_', ' ')).join(', ')}`;

      await enviarTexto(numeroDeTelefono, resumen);

      // Preguntar por el primero faltante
      const proximoPaso = PASOS[`FACTURA_${faltantes[0].toUpperCase()}`];
      const PLANTILLAS_MOD = await import('../whatsapp/plantillas.js');
      const pregunta = PLANTILLAS_MOD[`PEDIR_${faltantes[0].toUpperCase()}`];

      await siguientePaso(numeroDeTelefono, proximoPaso, datosActuales);
      await enviarTexto(numeroDeTelefono, pregunta);
    }
  } catch (error) {
    logearError(error, 'procesarImagenFactura');
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}
