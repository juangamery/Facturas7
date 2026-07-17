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
  obtenerUltimaFactura,
  obtenerFacturaPorID,
  getDB,
} from '../db.js';
import { logger, logearError } from '../logger.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { validarCUIT } from '../facturacion/validaciones.js';
import { generarPDFFactura } from '../facturacion/pdf.js';
import { solicitarCAE, emitirNotaCredito } from '../facturacion/factura.js';

// ==========================================
// PASOS / ESTADOS DE LA CONVERSACIÓN
// ==========================================

export const PASOS = {
  // Menu principal
  MENU_PRINCIPAL: 'menu_principal',

  // Pre-setup ARCA automático (usuario nuevo)
  PRE_SETUP_CUIT: 'pre_setup_cuit',
  PRE_SETUP_CLAVE: 'pre_setup_clave',

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
  ONBOARDING_CLAVE_FISCAL: 'onboarding_clave_fiscal',
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

  // Nota de crédito (anular factura)
  NOTA_CREDITO_CONFIRMACION: 'nota_credito_confirmacion',
};

// ==========================================
// GROQ - Interpretación Inteligente
// ==========================================

async function groqInterpretarCampo(campo, pregunta, respuestaUsuario) {
  try {
    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompts = {
      // Factura
      nombre_cliente: `Estoy rellenando una factura en WhatsApp.
Usuario respondió "${respuestaUsuario}" a la pregunta: "${pregunta}"

Extrae el nombre del cliente. Devuelve JSON:
{
  "valor": "nombre_aqui",
  "valido": true/false,
  "duda": "pregunta si necesitas aclarar algo (null si está claro)"
}

Sé inteligente: normaliza espacios, mayúsculas. Si es ambiguo o está incompleto, marca duda.`,

      documento_cliente: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Extrae documento (CUIT 11 dígitos, DNI 7-8 dígitos, o "CF" para consumidor final).
Devuelve JSON:
{
  "valor": "CF o documento_aqui",
  "valido": true/false,
  "duda": "pregunta si necesitas aclarar (null si OK)"
}`,

      concepto: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Extrae concepto/descripción. Normaliza.
{
  "valor": "concepto_aqui",
  "valido": true/false,
  "duda": null
}`,

      importe: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Extrae monto numérico (sin $ ni letras).
{
  "valor": 1000,
  "valido": true/false,
  "duda": "pregunta si hay dudas (null si OK)"
}`,

      // Onboarding
      cuit_onboarding: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Extrae CUIT argentino (11 dígitos, puede tener guiones/puntos/espacios).
{
  "valor": "20347351300",
  "valido": true/false,
  "duda": "aclaración si no está claro (null si OK)"
}`,

      razon_social: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Extrae nombre/razón social (normaliza mayúsculas, espacios).
{
  "valor": "Nombre Completo",
  "valido": true/false,
  "duda": null
}`,

      domicilio: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Extrae domicilio (calle, número, piso, etc).
{
  "valor": "Calle 123",
  "valido": true/false,
  "duda": null
}`,

      condicion_iva_onboarding: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Mapea a 1=Monotributista o 2=Responsable Inscripto.
Si dice "1" o "monotributista", → 1.
Si dice "2" o "responsable", → 2.
{
  "valor": 1,
  "valido": true/false,
  "duda": "aclaración (null si claro)"
}`,

      clave_fiscal: `Usuario respondió "${respuestaUsuario}" a: "${pregunta}"
Valida que sea una clave fiscal AFIP válida (generalmente 8+ caracteres, alfanuméricos).
{
  "valor": "clavefiscal_aqui",
  "valido": true/false,
  "duda": null
}`,
    };

    const prompt = prompts[campo] || `Usuario: "${respuestaUsuario}". Interpreta este campo: ${campo}. Devuelve JSON con "valor", "valido", "duda".`;

    const msg = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const respuesta = msg.choices[0]?.message?.content || '{}';
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valor: respuestaUsuario, valido: false, duda: 'No entendí' };

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.warn(`Groq interpret falla (${campo}): ${error.message}. Fallback literal.`);
    return { valor: respuestaUsuario, valido: true, duda: null };
  }
}

// Extrae nombre/documento + items[] (concepto+importe por línea) de texto libre.
// Soporta 1 o varios servicios/productos en el mismo mensaje.
async function groqExtraerFacturaCompleta(transcripcion, datosActuales) {
  try {
    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `TAREA: Extraer datos de factura del siguiente texto. Puede haber UNO o VARIOS
servicios/productos, cada uno con su propio importe.
Texto: "${transcripcion}"

CAMPOS a buscar:
- nombre: nombre del cliente (ej: "Juan García", "Empresa XYZ")
- documento: número de ID (ej: "20-12345678-9" = CUIT, "12345678" = DNI, "CF" = consumidor final)
- items: array de {concepto, importe} — un objeto POR CADA servicio/producto mencionado,
  con su descripción y su monto en pesos (sin $, sin "pesos")

EJEMPLOS:
Input: "tamara troche, por el servicio de diseño de remeras $1000"
Output: {"nombre": "tamara troche", "items": [{"concepto": "diseño de remeras", "importe": 1000}]}

Input: "Juan García, documento 12345678, servicio de consultoría, $5000"
Output: {"nombre": "Juan García", "documento": "12345678", "items": [{"concepto": "consultoría", "importe": 5000}]}

Input: "Facturale a Pedro: diseño de logo 5000, hosting anual 2000, dominio 1000"
Output: {"nombre": "Pedro", "items": [{"concepto": "diseño de logo", "importe": 5000}, {"concepto": "hosting anual", "importe": 2000}, {"concepto": "dominio", "importe": 1000}]}

INSTRUCCIONES:
1. Extrae CUALQUIER cosa que pueda ser un campo
2. Normaliza números (quita $, pesos, guiones innecesarios)
3. Cada concepto va con SU PROPIO importe, no los mezcles
4. Devuelve SOLO JSON válido, sin explicaciones

Responde SOLO con JSON (sin markdown, sin comillas extras):
{
  "nombre": "...",
  "documento": "...",
  "items": [{"concepto": "...", "importe": número}]
}

Omite campos que NO tengas. Si no extraes nada, devuelve {}.`;

    const msg = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const respuesta = msg.choices[0]?.message?.content || '{}';
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn(`Groq no extrae JSON: ${respuesta.substring(0, 100)}`);
      return {};
    }

    const resultado = JSON.parse(jsonMatch[0]);

    // Derivar concepto (join) e importe (suma) — compat con código que lee campos únicos
    if (Array.isArray(resultado.items) && resultado.items.length > 0) {
      resultado.items = resultado.items
        .filter(i => i && i.concepto && !isNaN(parseFloat(i.importe)))
        .map(i => ({ concepto: String(i.concepto).trim(), importe: parseFloat(i.importe) }));
      if (resultado.items.length > 0) {
        resultado.concepto = resultado.items.map(i => i.concepto).join(' + ');
        resultado.importe = resultado.items.reduce((sum, i) => sum + i.importe, 0);
      } else {
        delete resultado.items;
      }
    }

    logger.info(`[GROQ EXTRACCIÓN] Input: "${transcripcion}" → Output: ${JSON.stringify(resultado)}`);
    return resultado;
  } catch (error) {
    logger.warn(`Groq extracción falla: ${error.message}`);
    return {};
  }
}

// Interpreta un pedido de corrección sobre una factura ya armada
// (ej: "agregá el concepto de administración de redes por $1500",
// "el importe es 2000 no 1000"). Devuelve los datos actualizados o
// null si el mensaje no es una corrección reconocible.
async function groqCorregirFactura(texto, datosActuales) {
  try {
    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `Estoy por emitir esta factura:
- Cliente: ${datosActuales.razon_social_cliente || ''}
- Documento: ${datosActuales.documento_cliente || ''}
- Concepto: ${datosActuales.concepto || ''}
- Importe: ${datosActuales.importe || ''}

El usuario respondió (no es un SI/NO simple): "${texto}"

Si es un pedido de corrección (agregar/cambiar concepto, importe, cliente o documento),
devolvé los 4 campos ACTUALIZADOS combinando lo que ya había con el cambio pedido.
Si pide "agregar" un concepto/ítem, concatenalo al concepto existente y SUMÁ los importes.
Si el mensaje NO es una corrección (es ruido, pregunta no relacionada, etc), devolvé {}.

Responde SOLO JSON:
{"razon_social_cliente": "...", "documento_cliente": "...", "concepto": "...", "importe": numero}`;

    const msg = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const respuesta = msg.choices[0]?.message?.content || '{}';
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const resultado = JSON.parse(jsonMatch[0]);
    if (!resultado.concepto && !resultado.importe && !resultado.razon_social_cliente) return null;

    logger.info(`[GROQ CORRECCIÓN] Input: "${texto}" → Output: ${JSON.stringify(resultado)}`);
    return { ...datosActuales, ...resultado };
  } catch (error) {
    logger.warn(`Groq corrección falla: ${error.message}`);
    return null;
  }
}

function obtenerCamposFaltantes(datos) {
  const faltantes = [];
  if (!datos.razon_social_cliente) faltantes.push('nombre_cliente');
  if (!datos.documento_cliente) faltantes.push('documento_cliente');
  if (!datos.concepto) faltantes.push('concepto');
  if (!datos.importe) faltantes.push('importe');
  return faltantes;
}

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
// Match de palabra completa (no substring) — algunas listas tienen dígitos
// sueltos ('1','2'...) que con .includes() matchean cualquier texto que
// los contenga (ej: "tengo 15 años" → FACTURA por el '1').
export function detectarIntencion(texto) {
  const t = texto.toLowerCase().trim();

  if (contienePalabraExacta(t, PLANTILLAS.PALABRAS_FACTURA)) {
    return 'FACTURA';
  }
  if (contienePalabraExacta(t, PLANTILLAS.PALABRAS_ULTIMA)) {
    return 'ULTIMA_FACTURA';
  }
  if (contienePalabraExacta(t, PLANTILLAS.PALABRAS_DATOS)) {
    return 'MIS_DATOS';
  }
  if (contienePalabraExacta(t, PLANTILLAS.PALABRAS_NOTA_CREDITO)) {
    return 'NOTA_CREDITO';
  }
  if (contienePalabraExacta(t, PLANTILLAS.PALABRAS_CANCELAR)) {
    return 'CANCELAR';
  }
  if (contienePalabraExacta(t, PLANTILLAS.PALABRAS_MENU)) {
    return 'MENU';
  }

  return null;
}

// Match de PALABRA COMPLETA (no substring). Antes usaba .includes(), y como
// PALABRAS_SI incluye 's' suelta, CUALQUIER frase con la letra "s" (o sea,
// casi cualquier oración en español) se leía como confirmación positiva.
function contienePalabraExacta(texto, palabras) {
  const normalizado = ` ${texto.toLowerCase().trim()} `;
  return palabras.some((p) => {
    const regex = new RegExp(`[^a-záéíóúñ0-9]${p}[^a-záéíóúñ0-9]`, 'i');
    return regex.test(normalizado);
  });
}

// Verifica si el texto es confirmación positiva
export function esConfirmacionSI(texto) {
  return contienePalabraExacta(texto, PLANTILLAS.PALABRAS_SI);
}

// Verifica si el texto es confirmación negativa
export function esConfirmacionNO(texto) {
  return contienePalabraExacta(texto, PLANTILLAS.PALABRAS_NO);
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
      const interpretacion = await groqInterpretarCampo('cuit_onboarding', 'CUIT (11 dígitos sin guiones)', texto);
      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.CUIT_INVALIDO);
        return;
      }
      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }
      await guardarDato(numeroDeTelefono, 'cuit', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_RAZON_SOCIAL);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_RAZON_SOCIAL);
    } else if (paso === PASOS.ONBOARDING_RAZON_SOCIAL) {
      const interpretacion = await groqInterpretarCampo('razon_social', 'Nombre o razón social', texto);
      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.PEDIR_RAZON_SOCIAL);
        return;
      }
      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }
      await guardarDato(numeroDeTelefono, 'razon_social', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_DOMICILIO);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_DOMICILIO);
    } else if (paso === PASOS.ONBOARDING_DOMICILIO) {
      const interpretacion = await groqInterpretarCampo('domicilio', 'Domicilio fiscal (calle y número)', texto);
      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.PEDIR_DOMICILIO);
        return;
      }
      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }
      await guardarDato(numeroDeTelefono, 'domicilio', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CONDICION_IVA);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CONDICION_IVA);
    } else if (paso === PASOS.ONBOARDING_CONDICION_IVA) {
      const interpretacion = await groqInterpretarCampo('condicion_iva_onboarding', '1=Monotributista o 2=Responsable Inscripto', texto);
      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.CONDICION_IVA_INVALIDA);
        return;
      }
      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }
      const condicion = interpretacion.valor === 1 || interpretacion.valor === '1' ? 'Monotributista' : 'Responsable Inscripto';
      await guardarDato(numeroDeTelefono, 'condicion_iva', condicion);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_PUNTO_VENTA);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_PUNTO_VENTA);
    } else if (paso === PASOS.ONBOARDING_PUNTO_VENTA) {
      if (esConfirmacionNO(texto)) {
        await enviarTexto(numeroDeTelefono, PLANTILLAS.INSTRUCCIONES_PUNTO_VENTA);
        return;
      }
      const interpretacion = await groqInterpretarCampo('importe', 'Punto de venta (número)', texto);
      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.PEDIR_PUNTO_VENTA);
        return;
      }
      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }
      await guardarDato(numeroDeTelefono, 'punto_venta', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CLAVE_FISCAL, datosActuales);
      await enviarTexto(numeroDeTelefono, `🔐 Tu clave fiscal AFIP se usa UNA SOLA VEZ para configurar tu cuenta.\n\n✅ La usaremos en este momento y la descartaremos completamente.\n✅ Nunca la almacenamos ni la vemos.\n\nEscribila:`);
    } else if (paso === PASOS.ONBOARDING_CLAVE_FISCAL) {
      const interpretacion = await groqInterpretarCampo('clave_fiscal', 'Clave fiscal AFIP', texto);
      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || '⚠️ Clave fiscal no válida. Revisá e intentá de nuevo.');
        return;
      }
      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }
      await guardarDato(numeroDeTelefono, 'clave_fiscal_temp', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CONFIRMACION, datosActuales);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.onboardingCompleto(datosActuales));
    } else if (paso === PASOS.ONBOARDING_CONFIRMACION) {
      if (esConfirmacionSI(texto)) {
        await enviarTexto(numeroDeTelefono, '⏳ Registrando en AFIPSDK...');

        // Guardar datos básicos
        const usuario = await obtenerUsuario(numeroDeTelefono);
        await actualizarUsuario(usuario.id, {
          cuit: datosActuales.cuit,
          razon_social: datosActuales.razon_social,
          domicilio: datosActuales.domicilio,
          condicion_iva: datosActuales.condicion_iva,
          punto_venta: datosActuales.punto_venta,
        });

        // Registrar en AFIPSDK automáticamente (con clave fiscal)
        try {
          const { registrarUsuarioAFIPSDK } = await import('../facturacion/afipsdk_registro.js');
          const resultado = await registrarUsuarioAFIPSDK(
            usuario.id,
            datosActuales.cuit,
            datosActuales.clave_fiscal_temp, // Usar clave temporal UNA SOLA VEZ
            datosActuales.razon_social
          );

          if (resultado.exito) {
            await enviarTexto(numeroDeTelefono, `${resultado.mensaje}\n\n🔐 Tu clave fiscal se descartó completamente.`);
          } else {
            await enviarTexto(
              numeroDeTelefono,
              `⚠️ ${resultado.mensaje}\n\nPuedes intentar registrarte manualmente en https://www.afip.gob.ar`
            );
          }
        } catch (afipError) {
          logger.warn(`AFIPSDK registro falla: ${afipError.message}`);
          await enviarTexto(
            numeroDeTelefono,
            '⚠️ No pude registrar en AFIPSDK. Podés intentar manualmente después.'
          );
        }

        // Limpiar conversación (incluyendo clave temporal)
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
    // EN CUALQUIER PASO: intentar extraer TODOS los campos
    if (
      paso === PASOS.FACTURA_NOMBRE_CLIENTE ||
      paso === PASOS.FACTURA_DOCUMENTO_CLIENTE ||
      paso === PASOS.FACTURA_CONCEPTO ||
      paso === PASOS.FACTURA_IMPORTE
    ) {
      const extraccion = await groqExtraerFacturaCompleta(texto, datosActuales);

      // Mapear campos extraídos a nombres del sistema
      const mapeo = { nombre: 'razon_social_cliente', documento: 'documento_cliente', concepto: 'concepto', importe: 'importe', items: 'items' };
      for (const [key, value] of Object.entries(extraccion)) {
        const campoSistema = mapeo[key];
        if (campoSistema && value) {
          await guardarDato(numeroDeTelefono, campoSistema, value);
          datosActuales[campoSistema] = value;
        }
      }

      const faltantes = obtenerCamposFaltantes(datosActuales);
      if (faltantes.length === 0) {
        // TODOS completos → confirmación directo (skip preguntas restantes)
        await siguientePaso(numeroDeTelefono, PASOS.FACTURA_CONFIRMACION, datosActuales);
        await enviarTexto(
          numeroDeTelefono,
          PLANTILLAS.resumenFactura({
            tipo_comprobante: 'Factura C',
            ...datosActuales,
          })
        );
        return;
      } else if (Object.keys(extraccion).length > 0) {
        // Parcial → rellenar lo que tiene, preguntar solo faltantes
        const proximoPaso = PASOS[`FACTURA_${faltantes[0].toUpperCase()}`];
        const pregunta = PLANTILLAS[`PEDIR_${faltantes[0].toUpperCase()}`];
        await siguientePaso(numeroDeTelefono, proximoPaso, datosActuales);
        await enviarTexto(numeroDeTelefono, pregunta);
        return;
      }
      // Si no extrae nada, continúa con lógica normal de paso
    }

    if (paso === PASOS.FACTURA_NOMBRE_CLIENTE) {
      const interpretacion = await groqInterpretarCampo('nombre_cliente', PLANTILLAS.PEDIR_NOMBRE_CLIENTE, texto);

      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.PEDIR_NOMBRE_CLIENTE);
        return;
      }

      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }

      await guardarDato(numeroDeTelefono, 'razon_social_cliente', interpretacion.valor);
      await siguientePaso(
        numeroDeTelefono,
        PASOS.FACTURA_DOCUMENTO_CLIENTE
      );
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_DOCUMENTO_CLIENTE);
    } else if (paso === PASOS.FACTURA_DOCUMENTO_CLIENTE) {
      const interpretacion = await groqInterpretarCampo('documento_cliente', PLANTILLAS.PEDIR_DOCUMENTO_CLIENTE, texto);

      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.DOCUMENTO_INVALIDO);
        return;
      }

      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }

      await guardarDato(numeroDeTelefono, 'documento_cliente', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.FACTURA_CONCEPTO);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CONCEPTO);
    } else if (paso === PASOS.FACTURA_CONCEPTO) {
      const interpretacion = await groqInterpretarCampo('concepto', PLANTILLAS.PEDIR_CONCEPTO, texto);

      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.PEDIR_CONCEPTO);
        return;
      }

      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }

      await guardarDato(numeroDeTelefono, 'concepto', interpretacion.valor);
      await siguientePaso(numeroDeTelefono, PASOS.FACTURA_IMPORTE);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_IMPORTE);
    } else if (paso === PASOS.FACTURA_IMPORTE) {
      const interpretacion = await groqInterpretarCampo('importe', PLANTILLAS.PEDIR_IMPORTE, texto);

      if (!interpretacion.valido) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda || PLANTILLAS.IMPORTE_INVALIDO);
        return;
      }

      if (interpretacion.duda) {
        await enviarTexto(numeroDeTelefono, interpretacion.duda);
        return;
      }

      const importe = interpretacion.valor;
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
          const puntoVenta = datosActuales.punto_venta || usuario.punto_venta || 1;

          // Ítems: multi-línea si vino de Groq, si no, un único ítem legacy (concepto/importe)
          const items = (Array.isArray(datosActuales.items) && datosActuales.items.length > 0)
            ? datosActuales.items
            : [{ concepto: datosActuales.concepto, importe: parseFloat(datosActuales.importe) }];

          const datosFactura = {
            fecha_emision: new Date().toISOString().split('T')[0],
            tipo_comprobante: 'Factura C',
            razon_social_cliente: datosActuales.razon_social_cliente,
            documento_cliente: datosActuales.documento_cliente || 'CF',
            concepto: datosActuales.concepto,
            importe: datosActuales.importe,
            items,
            punto_venta: puntoVenta,
            // Datos AFIP
            cuit: usuario.cuit,
            condicion_iva_cliente: 5, // 5=Consumidor Final (por defecto)
            concepto_afip: 1, // 1=Productos
            entorno: process.env.AFIPSDK_ENTORNO || 'homologacion',
          };

          // Solicitar CAE a AFIP PRIMERO — el número real de comprobante lo asigna AFIP,
          // no lo inventamos nosotros (antes se generaba un número random acá).
          let cae = 'PENDIENTE';
          let vencimientoCae = '';
          let numeroComprobante = null;
          try {
            const respCAE = await solicitarCAE(datosFactura);
            cae = respCAE?.cae || 'PENDIENTE';
            vencimientoCae = respCAE?.vencimiento_cae || '';
            numeroComprobante = respCAE?.numero_comprobante || null;
          } catch (caeError) {
            logearError(caeError, 'solicitarCAE');
            // En homologación: generar CAE test (sin número real de AFIP disponible)
            const isHomologacion = !datosFactura.entorno || datosFactura.entorno === 'homologacion';
            if (isHomologacion) {
              const fechaHoy = new Date();
              const vencimiento = new Date(fechaHoy.getTime() + 20 * 24 * 60 * 60 * 1000); // 20 días
              cae = `TEST-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
              vencimientoCae = vencimiento.toISOString().split('T')[0];
              logger.info(`🧪 CAE mock generado para homologación: ${cae}`);
            }
          }

          // Número de factura: real de AFIP si lo tenemos, si no un placeholder de homologación
          const numeroFactura = numeroComprobante
            ? `${String(puntoVenta).padStart(5, '0')}-${String(numeroComprobante).padStart(8, '0')}`
            : `${String(puntoVenta).padStart(5, '0')}-TEST`;
          datosFactura.numero_factura = numeroFactura;

          // Generar PDF con CAE y número YA reales (no un placeholder que después queda desactualizado)
          let pdfPath;
          try {
            pdfPath = await generarPDFFactura({
              ...datosFactura,
              domicilio_cliente: '',
              razon_social_emisor: usuario.razon_social,
              cuit_emisor: usuario.cuit,
              domicilio_emisor: usuario.domicilio,
              condicion_iva: usuario.condicion_iva,
              cae,
              vencimiento_cae: vencimientoCae,
            });
          } catch (pdfError) {
            logger.warn(`PDF falla: ${pdfError.message}`);
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
            items,
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

          // Enviar PDF
          if (pdfPath) {
            try {
              const { enviarDocumento } = await import('../whatsapp/mensajes.js');
              await enviarDocumento(numeroDeTelefono, pdfPath, `Factura_${datosFactura.numero_factura}.pdf`);
            } catch (pdfSendError) {
              logger.warn(`PDF no pudo enviarse: ${pdfSendError.message}`);
            }
          }

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
        // No es SI/NO claro → puede ser un pedido de corrección
        // ("agregá otro concepto", "el importe es 2000 no 1000", etc.)
        const corregido = await groqCorregirFactura(texto, datosActuales);
        if (corregido) {
          await siguientePaso(numeroDeTelefono, PASOS.FACTURA_CONFIRMACION, corregido);
          await enviarTexto(
            numeroDeTelefono,
            `✏️ Actualicé la factura:\n\n${PLANTILLAS.resumenFactura({ tipo_comprobante: 'Factura C', ...corregido })}`
          );
        } else {
          await enviarTexto(numeroDeTelefono, 'No entendí. Respondé SI para confirmar, NO para volver a cargar, o decime qué corregir (ej: "el importe es 2000").');
        }
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
// NOTA DE CRÉDITO — anular la última factura
// ==========================================

export async function iniciarNotaCredito(numeroDeTelefono, usuario) {
  try {
    const ultima = await obtenerUltimaFactura(usuario.id);
    if (!ultima) {
      await enviarTexto(numeroDeTelefono, '📋 No tenés facturas emitidas para anular.');
      await mostrarMenuPrincipal(numeroDeTelefono, usuario);
      return;
    }
    if (String(ultima.tipo_comprobante || '').startsWith('Nota de Crédito')) {
      await enviarTexto(numeroDeTelefono, '⚠️ Tu última operación ya es una Nota de Crédito. No se puede anular otra Nota de Crédito.');
      await mostrarMenuPrincipal(numeroDeTelefono, usuario);
      return;
    }

    await siguientePaso(numeroDeTelefono, PASOS.NOTA_CREDITO_CONFIRMACION, { factura_id: ultima.id });
    await enviarTexto(
      numeroDeTelefono,
      `📋 Vas a anular esta factura con una Nota de Crédito:\n\n` +
      `• N°: ${ultima.numero_factura}\n` +
      `• Cliente: ${ultima.razon_social_cliente}\n` +
      `• Concepto: ${ultima.concepto}\n` +
      `• Importe: $${ultima.importe}\n\n` +
      `¿Confirmás? (SI / NO)`
    );
  } catch (error) {
    logger.error(`[NOTA_CREDITO] iniciarNotaCredito falla: ${error.message}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

export async function procesarNotaCredito(numeroDeTelefono, texto, datosActuales, usuario) {
  try {
    if (esConfirmacionSI(texto)) {
      await enviarTexto(numeroDeTelefono, '⏳ Emitiendo Nota de Crédito...');

      const facturaOriginal = await obtenerFacturaPorID(datosActuales.factura_id);
      if (!facturaOriginal) {
        await enviarTexto(numeroDeTelefono, '❌ No encontré la factura original. Puede que ya haya sido anulada.');
        await limpiarConversacion(numeroDeTelefono);
        await mostrarMenuPrincipal(numeroDeTelefono, usuario);
        return;
      }

      const items = (Array.isArray(facturaOriginal.items) && facturaOriginal.items.length > 0)
        ? facturaOriginal.items
        : [{ concepto: facturaOriginal.concepto, importe: parseFloat(facturaOriginal.importe) }];

      const [ptoVtaStr, nroStr] = String(facturaOriginal.numero_factura || '').split('-');
      const ptoVtaOriginal = parseInt(ptoVtaStr, 10) || usuario.punto_venta || 1;
      const numeroOriginal = parseInt(nroStr, 10) || 0;

      const datosNC = {
        fecha_emision: new Date().toISOString().split('T')[0],
        tipo_comprobante: 'Factura C', // usado por emitirNotaCredito para mapear a NC C (13)
        razon_social_cliente: facturaOriginal.razon_social_cliente,
        documento_cliente: facturaOriginal.documento_cliente || 'CF',
        concepto: facturaOriginal.concepto,
        importe: facturaOriginal.importe,
        items,
        punto_venta: usuario.punto_venta || ptoVtaOriginal,
        cuit: usuario.cuit,
        condicion_iva_cliente: 5,
        concepto_afip: 1,
        entorno: process.env.AFIPSDK_ENTORNO || 'homologacion',
        comprobanteAsociado: {
          tipo: 11, // Factura C
          ptoVta: ptoVtaOriginal,
          nro: numeroOriginal,
        },
      };

      let cae = 'PENDIENTE';
      let vencimientoCae = '';
      let numeroComprobante = null;
      try {
        const resp = await emitirNotaCredito(datosNC);
        cae = resp?.cae || 'PENDIENTE';
        vencimientoCae = resp?.vencimiento_cae || '';
        numeroComprobante = resp?.numero_comprobante || null;
      } catch (caeError) {
        logearError(caeError, 'emitirNotaCredito');
        const isHomologacion = !datosNC.entorno || datosNC.entorno === 'homologacion';
        if (isHomologacion) {
          const vencimiento = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
          cae = `TEST-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
          vencimientoCae = vencimiento.toISOString().split('T')[0];
          logger.info(`🧪 CAE mock (NC) generado para homologación: ${cae}`);
        }
      }

      const numeroNC = numeroComprobante
        ? `${String(datosNC.punto_venta).padStart(5, '0')}-${String(numeroComprobante).padStart(8, '0')}`
        : `${String(datosNC.punto_venta).padStart(5, '0')}-TEST`;
      datosNC.numero_factura = numeroNC;
      datosNC.tipo_comprobante = 'Nota de Crédito C';

      let pdfPath;
      try {
        pdfPath = await generarPDFFactura({
          ...datosNC,
          domicilio_cliente: '',
          razon_social_emisor: usuario.razon_social,
          cuit_emisor: usuario.cuit,
          domicilio_emisor: usuario.domicilio,
          condicion_iva: usuario.condicion_iva,
          cae,
          vencimiento_cae: vencimientoCae,
        });
      } catch (pdfError) {
        logger.warn(`PDF Nota de Crédito falla: ${pdfError.message}`);
      }

      await getDB().from('facturas').insert({
        usuario_id: usuario.id,
        numero_telefono: numeroDeTelefono,
        fecha_emision: datosNC.fecha_emision,
        tipo_comprobante: 'Nota de Crédito C',
        numero_factura: numeroNC,
        razon_social_cliente: datosNC.razon_social_cliente,
        documento_cliente: datosNC.documento_cliente,
        concepto: datosNC.concepto,
        importe: datosNC.importe,
        items,
        cae,
        vencimiento_cae: vencimientoCae,
        pdf_path: pdfPath || '',
        origen: 'whatsapp',
        creado_en: Math.floor(Date.now() / 1000),
        factura_original_id: facturaOriginal.id,
      });

      await enviarTexto(
        numeroDeTelefono,
        `✅ Nota de Crédito emitida.\n\n📄 N°: ${numeroNC}\n🔑 CAE: ${cae}\n\nAnula la factura ${facturaOriginal.numero_factura}.`
      );

      if (pdfPath) {
        try {
          const { enviarDocumento } = await import('../whatsapp/mensajes.js');
          await enviarDocumento(numeroDeTelefono, pdfPath, `NotaCredito_${numeroNC}.pdf`);
        } catch (pdfSendError) {
          logger.warn(`PDF Nota de Crédito no pudo enviarse: ${pdfSendError.message}`);
        }
      }

      await limpiarConversacion(numeroDeTelefono);
      await siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL);
    } else if (esConfirmacionNO(texto)) {
      await limpiarConversacion(numeroDeTelefono);
      await siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL);
      await mostrarMenuPrincipal(numeroDeTelefono, usuario);
    } else {
      await enviarTexto(numeroDeTelefono, 'Respondé SI o NO.');
    }
  } catch (error) {
    logger.error(`[NOTA_CREDITO] procesarNotaCredito falla: ${error.message}`);
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

    // En flujo factura: extraer múltiples campos si están presentes
    if (
      paso === PASOS.FACTURA_NOMBRE_CLIENTE ||
      paso === PASOS.FACTURA_DOCUMENTO_CLIENTE ||
      paso === PASOS.FACTURA_CONCEPTO ||
      paso === PASOS.FACTURA_IMPORTE
    ) {
      // Groq extrae TODOS los campos de la transcripción
      const extraccion = await groqExtraerFacturaCompleta(transcripcion, datosActuales);

      if (extraccion.nombre) await guardarDato(numeroDeTelefono, 'razon_social_cliente', extraccion.nombre);
      if (extraccion.documento) await guardarDato(numeroDeTelefono, 'documento_cliente', extraccion.documento);
      if (extraccion.concepto) await guardarDato(numeroDeTelefono, 'concepto', extraccion.concepto);
      if (extraccion.importe) await guardarDato(numeroDeTelefono, 'importe', extraccion.importe);

      const datos = { ...datosActuales, ...extraccion };
      const faltantes = obtenerCamposFaltantes(datos);

      if (faltantes.length === 0) {
        // Todos completos → confirmación
        await siguientePaso(numeroDeTelefono, PASOS.FACTURA_CONFIRMACION, datos);
        await enviarTexto(
          numeroDeTelefono,
          PLANTILLAS.resumenFactura({
            tipo_comprobante: 'Factura C',
            ...datos,
          })
        );
      } else {
        // Faltan campos → preguntar por el primero faltante
        const proximoPaso = PASOS[`FACTURA_${faltantes[0].toUpperCase()}`];
        const pregunta = PLANTILLAS[`PEDIR_${faltantes[0].toUpperCase()}`];
        await siguientePaso(numeroDeTelefono, proximoPaso, datos);
        await enviarTexto(numeroDeTelefono, pregunta);
      }
      return;
    }

    // En onboarding: procesar como antes
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
