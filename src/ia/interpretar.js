// ==========================================
// GROQ NLU - Interpretación conversacional de facturas
// ==========================================
// Extrae los datos de una factura desde lenguaje natural (texto o audio
// transcripto). Acumula con lo que ya se sabía y detecta la intención.
// Un solo mensaje puede traer todo junto: "facturale a Juan Perez CUIT
// 20-12345678-9 por diseño de logo 15000 pesos".

import axios from 'axios';
import { logger, logearError } from '../logger.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'llama-3.3-70b-versatile';

const CAMPOS = ['razon_social_cliente', 'documento_cliente', 'concepto', 'importe'];

// Palabras que indican confirmación / negación (rápido, sin llamar a la IA)
const SI = ['si', 'sí', 'dale', 'ok', 'oka', 'okey', 'confirmo', 'confirmar', 'listo',
  'correcto', 'perfecto', 'va', 'vale', 'bien', 'exacto', 'de una', 'emiti', 'emití',
  'emitir', 'genera', 'generar', 'hacela', 'hazla', 'adelante', 'yes', 'sip', 'obvio'];
const NO = ['no', 'nop', 'cancelar', 'cancela', 'mal', 'esta mal', 'está mal', 'cambiar',
  'corregir', 'de nuevo', 'nada', 'pará', 'para', 'stop'];

// ¿SI / NO / dudoso? — para el paso de confirmación
export function interpretarConfirmacion(texto) {
  const t = String(texto || '').trim().toLowerCase().replace(/[.!¡¿?]/g, '');
  if (!t) return 'duda';
  if (SI.includes(t) || SI.some(w => t.startsWith(w + ' '))) return 'si';
  if (NO.includes(t) || NO.some(w => t.startsWith(w + ' '))) return 'no';
  // palabra suelta dentro del texto
  if (/\b(si|sí|dale|confirmo|correcto|listo|perfecto)\b/.test(t)) return 'si';
  if (/\b(no|cancelar|cambiar|corregir)\b/.test(t)) return 'no';
  return 'duda';
}

// ===== EXTRAER DATOS DE FACTURA (lenguaje natural) =====
// Devuelve { intencion, campos } donde campos ya viene mergeado con lo previo.
export async function interpretarFactura(texto, datosPrevios = {}) {
  const previosStr = JSON.stringify({
    razon_social_cliente: datosPrevios.razon_social_cliente || null,
    documento_cliente: datosPrevios.documento_cliente || null,
    concepto: datosPrevios.concepto || null,
    importe: datosPrevios.importe || null,
  });

  const prompt = `Sos el asistente de un sistema de facturación electrónica argentino (monotributo, Factura C). El usuario habla en lenguaje natural, informal, argentino. Puede dar todos los datos juntos o de a poco.

Datos que YA teníamos de esta factura (no los pierdas, solo completá o corregí):
${previosStr}

Mensaje nuevo del usuario:
"${texto}"

Devolvé ÚNICAMENTE un JSON válido con esta forma exacta:
{
  "intencion": "factura" | "cancelar" | "saludo" | "otro",
  "razon_social_cliente": "nombre o razón social del cliente, o null",
  "documento_cliente": "solo dígitos del CUIT (11) o DNI (7-8), o 'CF' si es consumidor final, o null",
  "concepto": "descripción de lo que se factura, o null",
  "importe": número en pesos sin puntos ni comas, o null
}

Reglas:
- "intencion": "factura" si está pidiendo/armando una factura o dando datos de una. "cancelar" si quiere cancelar/parar. "saludo" si solo saluda. "otro" si no tiene que ver.
- Documento: extraé SOLO los números. "20-12345678-9" -> "20123456789". "DNI 30111222" -> "30111222". Si dice consumidor final, final, sin datos, no tiene CUIT -> "CF".
- Importe: "15 mil"/"15.000"/"quince mil" -> 15000. Solo el número.
- Mantené los datos previos que no se contradigan. Null solo si nunca se dio ese dato.
- Sin texto extra, solo el JSON.`;

  try {
    const resp = await axios.post(
      GROQ_URL,
      {
        model: MODELO,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 20000 }
    );

    const raw = resp.data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    // Merge: lo nuevo pisa a lo previo solo si no es null/undefined
    const campos = { ...datosPrevios };
    for (const k of CAMPOS) {
      const v = parsed[k];
      if (v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null') {
        campos[k] = k === 'importe' ? String(v).replace(/[^\d.]/g, '') : String(v).trim();
      }
    }

    logger.info(`🧠 NLU intencion=${parsed.intencion} campos=${JSON.stringify(campos)}`);
    return { intencion: parsed.intencion || 'factura', campos };

  } catch (error) {
    logearError(error, 'interpretarFactura');
    // Si la IA falla, devolvemos lo que ya teníamos para no romper el flujo
    return { intencion: 'factura', campos: { ...datosPrevios }, error: true };
  }
}

// ¿Qué campos faltan para poder emitir?
export function camposFaltantes(campos) {
  return CAMPOS.filter(k => !campos[k] || String(campos[k]).trim() === '');
}
