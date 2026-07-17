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
import { generarLinkCheckout } from '../mercadopago/suscripcion.js';
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
  // Tolerante a texto extra en el mismo mensaje. Si además viene otra línea
  // que no es el CUIT, la tomamos como clave fiscal y saltamos directo a ARCA.
  if (paso === PASOS.PRE_SETUP_CUIT) {
    const candidatos = texto.match(/\d[\d.\-\s]{8,}\d/g) || [];
    let cuit = candidatos.map(c => c.replace(/\D/g, '')).find(d => d.length === 11);
    if (!cuit) {
      const soloDigitos = texto.replace(/\D/g, '');
      if (soloDigitos.length === 11) cuit = soloDigitos;
    }
    if (!cuit) {
      await enviarTexto(numeroDeTelefono, '❌ CUIT inválido. Debe tener 11 dígitos. Ej: 20-34735130-0');
      return;
    }

    // ¿Vino también la clave fiscal en el mismo mensaje (otra línea)?
    const otrasLineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => l.replace(/\D/g, '') !== cuit);
    const claveFiscal = otrasLineas.find(l => l.length >= 6);

    if (claveFiscal) {
      await guardarDato(numeroDeTelefono, 'cuit_setup', cuit);
      await procesarPreSetupARCA(numeroDeTelefono, usuario, cuit, claveFiscal);
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
    await procesarPreSetupARCA(numeroDeTelefono, usuario, cuit, claveFiscal);
    return;
  }

  // Usuario elige método registro: paso a paso (1) o todo junto (2)
  // Tolerante a frases (ej: "Bien el 2", "quiero la 1") — extrae dígito suelto
  if (paso === PASOS.REG_METODO) {
    const match = texto.match(/(?<![\d.])[12](?![\d.])/);
    const opcion = match ? match[0] : texto.trim();
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
  // CUIT y punto de venta YA se conocen del PRE_SETUP (no se piden de nuevo)
  if (paso === PASOS.REG_TODO_JUNTO) {
    const lineas = texto.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lineas.length < 4) {
      await enviarTexto(numeroDeTelefono, '❌ Necesito 4 datos: nombre, email, domicilio, condición IVA.');
      return;
    }

    const datosActuales = conv?.datos ? JSON.parse(conv.datos) : {};
    const cuit = datosActuales.cuit;
    const puntoVenta = datosActuales.punto_venta;

    if (!cuit || !puntoVenta) {
      logger.error(`REG_TODO_JUNTO sin cuit/punto_venta previos: ${JSON.stringify(datosActuales)}`);
      await enviarTexto(numeroDeTelefono, '❌ Falta configuración previa. Escribí "hola" para reiniciar.');
      return;
    }

    // Groq clasifica cada línea
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

      const prompt = `TAREA CRÍTICA: Clasificar 4 líneas de datos de registro. El orden NO IMPORTA.

Líneas del usuario:
${lineas.map((l, i) => `${i+1}. "${l}"`).join('\n')}

IDENTIFICA EXACTAMENTE QUÉ ES CADA LÍNEA:

NOMBRE: nombre completo, razón social, empresa (NO números, NO emails, NO direcciones)
  Ejemplo: "Carlos Federico", "Empresa XYZ"

EMAIL: contiene @ y punto
  Ejemplo: "cf@gunther@gmail.com", "empresa@mail.com"

DOMICILIO: calle, avenida, número, pero NO números solos ni emails
  Ejemplo: "Jauretche 975", "Av. Corrientes 1234"

IVA: solo 1 o 2
  Ejemplo: "1" = Monotributista, "2" = Responsable

DEVUELVE SOLO JSON (sin markdown, sin comillas extras):
{
  "nombre": "1",
  "email": "2",
  "domicilio": "3",
  "iva": "4"
}

Reglas:
- SIEMPRE devuelve JSON válido
- Los valores son números de línea (1-4)
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
      const email = datos.email;
      const domicilio = datos.domicilio;
      const iva = parseInt(datos.iva);

      if (!nombre || nombre.length < 2) {
        await enviarTexto(numeroDeTelefono, '❌ Nombre no reconocido.');
        return;
      }
      if (!EMAIL_RE.test(email)) {
        await enviarTexto(numeroDeTelefono, `❌ Email no válido: "${email}".`);
        return;
      }
      if (!domicilio || domicilio.length < 3) {
        await enviarTexto(numeroDeTelefono, '❌ Domicilio no reconocido.');
        return;
      }
      if (![1, 2].includes(iva)) {
        await enviarTexto(numeroDeTelefono, '❌ IVA debe ser 1 o 2.');
        return;
      }

      // Guardar en BD (cuit y punto_venta ya vienen del PRE_SETUP)
      const ahora = Math.floor(Date.now() / 1000);
      await actualizarUsuario(usuario.id, {
        nombre,
        email,
        cuit,
        razon_social: nombre,
        domicilio,
        condicion_iva: iva === 1 ? 'Monotributista' : 'Responsable Inscripto',
        punto_venta: puntoVenta,
        activo: 1,
        plan: 'trial',
        estado_registro: 'trial',
        fecha_vencimiento: ahora + SIETE_DIAS,
      });

      // Ya está TODO configurado (ARCA + datos de negocio) → directo al menú, sin onboarding redundante
      await limpiarConversacion(numeroDeTelefono);
      await enviarTexto(
        numeroDeTelefono,
        `✅ ¡Listo! Tu cuenta está configurada:\n\n• CUIT: ${cuit}\n• Razón social: ${nombre}\n• Domicilio: ${domicilio}\n• Punto de venta: ${puntoVenta}\n\nEscribí algo para ver el menú.`
      );
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

// Corre la automation ARCA (certificado + punto de venta) y avanza a REG_METODO.
// Compartido entre el flujo de 1 mensaje (CUIT+clave juntos) y el de 2 mensajes.
async function procesarPreSetupARCA(numeroDeTelefono, usuario, cuit, claveFiscal) {
  await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_PROCESANDO);
  try {
    const { configurarARCAAutomatico } = await import('../facturacion/arca_automation.js');
    const resultado = await configurarARCAAutomatico(usuario.id, cuit, claveFiscal);

    if (resultado.exito) {
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_EXITO);
      await guardarDato(numeroDeTelefono, 'punto_venta_arca', resultado.punto_venta);
      await siguientePaso(numeroDeTelefono, PASOS.REG_METODO, {
        cuit,
        punto_venta: resultado.punto_venta,
        arca_configurado: true,
      });
      await enviarTexto(numeroDeTelefono, PLANTILLAS.METODO_REGISTRO);
    } else {
      await enviarTexto(numeroDeTelefono, `${PLANTILLAS.PRE_SETUP_ERROR}\n\nDetalles: ${resultado.error}`);
    }
  } catch (error) {
    logger.error(`ARCA automation falla: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.PRE_SETUP_ERROR);
  }
}

async function enviarLinkPago(numeroDeTelefono, usuario, trial) {
  // No llama a MP todavía — el link es a nuestra propia página de checkout
  // (Checkout Bricks). La suscripción real se crea recién cuando el
  // cliente tokeniza su tarjeta ahí (ver mercadopago/checkout.js).
  const linkCheckout = generarLinkCheckout(usuario);
  await actualizarUsuario(usuario.id, {
    estado_registro: trial ? 'trial' : 'esperando_pago',
  });
  logger.info(`💳 Link de checkout enviado a usuario ${usuario.id}`);

  // Calcular fecha vencimiento (7 días desde hoy)
  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + SIETE_DIAS * 1000);
  const fechaFormato = `${vencimiento.getDate()}/${vencimiento.getMonth() + 1}/${vencimiento.getFullYear()}`;

  if (trial) {
    await enviarTexto(numeroDeTelefono,
      `🎉 Trial activado por 7 días. Vence el ${fechaFormato}.\n\nLink para suscribirte cuando quieras:\n${linkCheckout}`);
  } else {
    await enviarTexto(numeroDeTelefono, PLANTILLAS.avisoVencimiento(fechaFormato, linkCheckout));
  }
}
