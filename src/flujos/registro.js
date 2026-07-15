// ==========================================
// FLUJO DE REGISTRO AUTOMÁTICO + PAGO
// ==========================================
// El bot registra a desconocidos conversando: nombre → CUIT → email → prueba 7 días
// Luego onboarding: razón social → domicilio → IVA → punto venta
// + link de pago MercadoPago. El webhook activa la suscripción al pagar.

import {
  obtenerEstado,
  siguientePaso,
  limpiarConversacion,
  guardarDato,
  PASOS,
} from '../bot/conversacion.js';
import { obtenerUsuario, crearUsuario, actualizarUsuario } from '../db.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { crearSuscripcion } from '../mercadopago/suscripcion.js';
import { logger } from '../logger.js';
import Groq from 'groq-sdk';

const SIETE_DIAS = 7 * 24 * 60 * 60;
const EMAIL_RE = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Punto de entrada. Se llama cuando el acceso fue denegado
// (desconocido, inactivo o vencido).
export async function manejarRegistro(numeroDeTelefono, texto, usuarioAcceso) {
  let usuario = usuarioAcceso || await obtenerUsuario(numeroDeTelefono);
  const conv = await obtenerEstado(numeroDeTelefono);
  const paso = conv?.paso;

  // Desconocido total: pedir CUIT para setup automático
  if (!usuario) {
    usuario = await crearUsuario(numeroDeTelefono, {});
    await siguientePaso(numeroDeTelefono, PASOS.PRE_SETUP_CUIT, {});
    await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_REQUERIDO);
    return;
  }

  // Paso 1: Capturar CUIT del usuario
  if (paso === PASOS.PRE_SETUP_CUIT) {
    const cuit = texto.trim().replace(/[-.\s]/g, '');
    if (cuit.length !== 11 || isNaN(parseInt(cuit))) {
      await enviarTexto(numeroDeTelefono, '❌ CUIT inválido. Debe tener 11 dígitos. Ej: 20-34735130-0');
      return;
    }
    await guardarDato(numeroDeTelefono, 'cuit_setup', cuit);
    await siguientePaso(numeroDeTelefono, PASOS.PRE_SETUP_CLAVE, { cuit_setup: cuit });
    await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_CUIT_RECIBIDO);
    return;
  }

  // Paso 2: Capturar clave fiscal y hacer automation ARCA
  if (paso === PASOS.PRE_SETUP_CLAVE) {
    const claveFiscal = texto.trim();
    if (claveFiscal.length < 6) {
      await enviarTexto(numeroDeTelefono, '⚠️ Clave fiscal muy corta. Intentá de nuevo.');
      return;
    }

    const datosActuales = conv?.datos ? JSON.parse(conv.datos) : {};
    const cuit = datosActuales.cuit_setup || '';

    await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_PROCESANDO);

    // Hacer automation ARCA
    try {
      const { configurarARCAAutomatico } = await import('../facturacion/arca_automation.js');
      const resultado = await configurarARCAAutomatico(cuit, claveFiscal);

      if (resultado.exito) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_EXITO);

        // Guardar punto de venta obtenido
        await guardarDato(numeroDeTelefono, 'punto_venta_arca', resultado.punto_venta);

        // Continuar con registro normal
        await siguientePaso(numeroDeTelefono, PASOS.REG_METODO, {
          cuit: cuit,
          punto_venta: resultado.punto_venta,
          arca_configurado: true
        });
        await enviarTexto(numeroDeTelefono, PLANTILLAS.METODO_REGISTRO);
      } else {
        await enviarTexto(numeroDeTelefono, `${PLANTILLAS.PRE_SETUP_ERROR}\n\nDetalles: ${resultado.error}`);
      }
    } catch (error) {
      logger.error(`ARCA automation falla: ${error.message}`);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_ERROR);
    }
    return;
  }

  // Usuario elige método registro: paso a paso (1) o todo junto (2)
  if (paso === PASOS.REG_METODO) {
    const opcion = texto.trim();
    if (opcion === '1') {
      await siguientePaso(numeroDeTelefono, PASOS.REG_NOMBRE);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.pedir_nombre_registro);
      return;
    } else if (opcion === '2') {
      await siguientePaso(numeroDeTelefono, PASOS.REG_TODO_JUNTO);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.INSTRUCCIONES_TODO_JUNTO);
      return;
    } else {
      await enviarTexto(numeroDeTelefono, '❌ Respondé con 1 o 2.');
      return;
    }
  }

  // Todo de una vez: Groq identifica cada línea sin importar orden
  if (paso === PASOS.REG_TODO_JUNTO) {
    const lineas = texto.trim().split('\n').map(l => l.trim());
    if (lineas.length < 6) {
      await enviarTexto(numeroDeTelefono, '❌ Necesito 6 datos: nombre, CUIT, email, domicilio, IVA, punto venta.');
      return;
    }

    // Groq clasifica cada línea
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

      const prompt = `TAREA CRÍTICA: Clasificar 6 líneas de datos de registro. El orden NO IMPORTA.

Líneas del usuario:
${lineas.map((l, i) => `${i+1}. "${l}"`).join('\n')}

IDENTIFICA EXACTAMENTE QUÉ ES CADA LÍNEA:

NOMBRE: nombre completo, razón social, empresa (NO números, NO emails, NO direcciones)
  Ejemplo: "Carlos Federico", "Empresa XYZ"

CUIT: 11 dígitos, puede tener guiones/puntos
  Ejemplo: "20347351300", "20-34735130-0"

EMAIL: contiene @ y punto
  Ejemplo: "cf@gunther@gmail.com", "empresa@mail.com"

DOMICILIO: calle, avenida, número, pero NO números solos ni emails
  Ejemplo: "Jauretche 975", "Av. Corrientes 1234"

IVA: solo 1 o 2
  Ejemplo: "1" = Monotributista, "2" = Responsable

PUNTO_VENTA: número pequeño (típicamente 1-999)
  Ejemplo: "1", "5", "10"

DEVUELVE SOLO JSON (sin markdown, sin comillas extras):
{
  "nombre": "1",
  "cuit": "2",
  "email": "3",
  "domicilio": "4",
  "iva": "5",
  "punto_venta": "6"
}

Reglas:
- SIEMPRE devuelve JSON válido
- Los valores son números de línea (1-6)
- Si no encuentras un campo, omítelo
- NO guesses: si no está seguro, omite`;

      const msg = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const respuesta = msg.choices[0]?.message?.content || '{}';
      const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`Groq no retorna JSON: ${respuesta.substring(0, 200)}`);
        await enviarTexto(numeroDeTelefono, '❌ No entendí los datos. Revisá el formato.');
        return;
      }

      let mapeo;
      try {
        mapeo = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        logger.error(`JSON inválido: ${jsonMatch[0]}`);
        await enviarTexto(numeroDeTelefono, '❌ Error procesando datos. Reintentá.');
        return;
      }
      const datos = {};
      for (const [campo, lineaStr] of Object.entries(mapeo)) {
        const lineNum = parseInt(lineaStr) - 1;
        if (lineNum >= 0 && lineNum < lineas.length) {
          datos[campo] = lineas[lineNum];
        }
      }

      // Validar y normalizar
      const nombre = datos.nombre;
      const cuit = (datos.cuit || '').replace(/[-.\s]/g, '');
      const email = datos.email;
      const domicilio = datos.domicilio;
      const iva = parseInt(datos.iva);
      const punto = parseInt(datos.punto_venta);

      if (!nombre || nombre.length < 2) {
        await enviarTexto(numeroDeTelefono, '❌ Nombre no reconocido.');
        return;
      }
      if (cuit.length !== 11 || isNaN(parseInt(cuit))) {
        await enviarTexto(numeroDeTelefono, '❌ CUIT no válido (debe ser 11 dígitos).');
        return;
      }
      if (!EMAIL_RE.test(email)) {
        await enviarTexto(numeroDeTelefono, `❌ Email no válido: "${email}".`);
        return;
      }
      if (![1, 2].includes(iva)) {
        await enviarTexto(numeroDeTelefono, '❌ IVA debe ser 1 o 2.');
        return;
      }
      if (isNaN(punto) || punto < 1) {
        await enviarTexto(numeroDeTelefono, '❌ Punto de venta no válido.');
        return;
      }

      // Guardar en BD
      const ahora = Math.floor(Date.now() / 1000);
      await actualizarUsuario(usuario.id, {
        nombre,
        email,
        cuit,
        razon_social: nombre,
        domicilio,
        condicion_iva: iva === 1 ? 'Monotributista' : 'Responsable Inscripto',
        punto_venta: punto,
        activo: 1,
        plan: 'trial',
        estado_registro: 'trial',
        fecha_vencimiento: ahora + SIETE_DIAS,
      });

      // Post-registro → ONBOARDING (no MENU) para pedir clave fiscal + AFIPSDK
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CUIT, {
        cuit,
        razon_social: nombre,
        domicilio,
        condicion_iva: iva === 1 ? 'Monotributista' : 'Responsable Inscripto',
        punto_venta: punto,
      });
      await enviarTexto(numeroDeTelefono, '✅ Registrado! Ahora completá onboarding. Escribí tu CUIT (ya lo tenemos, confirmá o corregí):');
      await enviarLinkPago(numeroDeTelefono, { id: usuario.id, email, nombre, cuit }, true);
    } catch (error) {
      logger.error(`Groq clasificación falla: ${error.message}`);
      await enviarTexto(numeroDeTelefono, '❌ Error procesando datos. Reintentá.');
    }
    return;
  }

  if (paso === PASOS.REG_NOMBRE) {
    const nombre = texto.trim();
    if (nombre.length < 2) {
      await enviarTexto(numeroDeTelefono, 'Decime tu nombre o razón social 🙂');
      return;
    }
    await actualizarUsuario(usuario.id, { nombre });
    await siguientePaso(numeroDeTelefono, PASOS.REG_CUIT);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CUIT);
    return;
  }

  if (paso === PASOS.REG_CUIT) {
    const cuit = texto.trim().replace(/[-.\s]/g, '');
    if (cuit.length !== 11 || isNaN(parseInt(cuit))) {
      await enviarTexto(numeroDeTelefono, '❌ CUIT debe tener 11 dígitos. Ej: 20123456789');
      return;
    }
    await guardarDato(numeroDeTelefono, 'cuit', cuit);
    await siguientePaso(numeroDeTelefono, PASOS.REG_EMAIL);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.pedir_email_registro(usuario.nombre || 'Usuario'));
    return;
  }

  if (paso === PASOS.REG_EMAIL) {
    const email = texto.trim();
    if (!EMAIL_RE.test(email)) {
      await enviarTexto(numeroDeTelefono, 'Ese email no parece válido. Escribí uno correcto (ej: nombre@mail.com).');
      return;
    }
    const ahora = Math.floor(Date.now() / 1000);
    const conv = await obtenerEstado(numeroDeTelefono);
    const datosReg = conv?.datos ? JSON.parse(conv.datos) : {};

    await actualizarUsuario(usuario.id, {
      email,
      cuit: datosReg.cuit || null,
      activo: 1,
      plan: 'trial',
      estado_registro: 'trial',
      fecha_vencimiento: ahora + SIETE_DIAS,
    });
    await limpiarConversacion(numeroDeTelefono);
    await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_RAZON_SOCIAL, {});
    await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
    // Mandar también el link de pago para que se suscriba cuando quiera.
    await enviarLinkPago(numeroDeTelefono, { ...usuario, email, cuit: datosReg.cuit }, true);
    return;
  }

  // Usuario con datos pero inactivo/vencido, o pide pagar → link de pago.
  if (usuario.nombre && usuario.email) {
    return await enviarLinkPago(numeroDeTelefono, usuario, false);
  }

  // Sin datos y sin paso de registro → arrancar de cero.
  await siguientePaso(numeroDeTelefono, PASOS.REG_NOMBRE, {});
  await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
}

async function enviarLinkPago(numeroDeTelefono, usuario, trial) {
  const sub = await crearSuscripcion(usuario);
  if (!sub) {
    await enviarTexto(numeroDeTelefono, 'No pude generar el link de pago ahora. Reintentá en un rato 🙏');
    return;
  }
  await actualizarUsuario(usuario.id, {
    mp_subscription_id: sub.id,
    estado_registro: trial ? 'trial' : 'esperando_pago',
  });
  logger.info(`💳 Link de pago enviado a usuario ${usuario.id}`);

  // Calcular fecha vencimiento (7 días desde hoy)
  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + SIETE_DIAS * 1000);
  const fechaFormato = `${vencimiento.getDate()}/${vencimiento.getMonth() + 1}/${vencimiento.getFullYear()}`;

  if (trial) {
    await enviarTexto(numeroDeTelefono,
      `🎉 Trial activado por 7 días. Vence el ${fechaFormato}.\n\nLink para renovar cuando quieras:\n${sub.init_point}`);
  } else {
    await enviarTexto(numeroDeTelefono, PLANTILLAS.avisoVencimiento(fechaFormato, sub.init_point));
  }
}
