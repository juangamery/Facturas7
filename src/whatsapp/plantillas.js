// ==========================================
// PLANTILLAS DE MENSAJES DEL BOT
// ==========================================
// Centralizamos todos los textos del bot aquí.
// Ningún mensaje debe estar hardcodeado en otros archivos.
// Funciones para mensajes con datos dinámicos.
// Constantes para mensajes fijos.

// ==========================================
// MENSAJES DEL SISTEMA
// ==========================================

const BIENVENIDA_NUEVA = `👋 ¡Hola! Soy el asistente de facturación electrónica.

Para comenzar necesito configurar tu cuenta.
Este proceso toma solo 2 minutos. 📋

¿Cuál es tu CUIT?
Escribilo así: 20-12345678-9`;

const menuPrincipal = (nombre) => `👋 ¡Hola ${nombre}! ¿Qué necesitás hoy?

1️⃣ Emitir una factura
2️⃣ Ver mi última factura
3️⃣ Ver mis datos

También podés mandarme una 📸 foto o 🎤 audio con los datos y los proceso automáticamente.`;

const NO_AUTORIZADO = `👋 ¡Hola! Este es un servicio de facturación electrónica por suscripción.

Para obtener acceso contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}

¡Estaremos encantados de ayudarte! 😊`;

const suscripcionVencida = (fecha) => `⏰ Tu suscripción venció el ${fecha}.

Para renovar y seguir facturando contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}

¡Te esperamos! 😊`;

const limiteFacturasAlcanzado = (limite) => `⚠️ Llegaste al límite de tu plan este mes.
(${limite} facturas)

Para ampliar tu plan contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}`;

const CANCELADO = `❌ Operación cancelada.

Escribí cualquier cosa para volver al menú.`;

const TIMEOUT = `⏱️ La sesión expiró por inactividad.

Escribí cualquier cosa para empezar de nuevo.`;

const ERROR_GENERAL = `😕 Ocurrió un error inesperado.

Por favor intentá de nuevo en unos minutos.
Si el problema persiste contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}`;

// ==========================================
// PRE-SETUP: CONFIGURACIÓN ARCA REQUERIDA
// ==========================================

const PRE_SETUP_REQUERIDO = `🚀 ¡Bienvenido a Facturas7!

Voy a configurar automáticamente tu cuenta en ARCA. Toma 1 minuto.

Necesito:
1️⃣ Tu CUIT
2️⃣ Tu clave fiscal AFIP

⚠️ Tu clave se usa UNA SOLA VEZ y se descarta completamente.

¿Cuál es tu CUIT? (Ejemplo: 20-34735130-0)`;

const PRE_SETUP_CUIT_RECIBIDO = `✅ CUIT recibido.

Ahora tu clave fiscal (se descarta inmediatamente después de usarla).`;

const PRE_SETUP_PROCESANDO = `⏳ Configurando ARCA...

🔄 Accediendo a ARCA...
🔄 Delegando facturación electrónica...
🔄 Creando punto de venta...
🔄 Finalizando...`;

const PRE_SETUP_EXITO = `✅ ¡Cuenta configurada!

Ya estás listo para emitir facturas. Tu clave fiscal se descartó completamente.

Ahora completamos tu registro con los datos finales.`;

const PRE_SETUP_ERROR = `❌ Error configurando ARCA.

Verificá tu CUIT y clave fiscal, o intentá de nuevo en unos minutos.`;

// ==========================================
// FLUJO 1 — ONBOARDING
// ==========================================

const PEDIR_CUIT = `¿Cuál es tu CUIT?
Escribilo así: 20-12345678-9`;

const CUIT_INVALIDO = `❌ El CUIT ingresado no es válido.

Verificá el número y volvé a intentarlo.
Formato correcto: 20-12345678-9`;

const CUIT_VALIDO = `✅ CUIT válido.

¿Cuál es tu razón social o nombre completo?
(Como figura en ARCA)`;

const PEDIR_RAZON_SOCIAL = `¿Cuál es tu razón social o nombre completo?
(Como figura en ARCA)`;

const PEDIR_DOMICILIO = `¿Cuál es tu domicilio fiscal?
(Calle, número, ciudad)`;

const PEDIR_CONDICION_IVA = `¿Cuál es tu condición frente al IVA?

1️⃣ Monotributista
2️⃣ Responsable Inscripto`;

const CONDICION_IVA_INVALIDA = `Por favor respondé 1 o 2:

1️⃣ Monotributista
2️⃣ Responsable Inscripto`;

const PEDIR_PUNTO_VENTA = `¿Cuál es tu número de punto de venta tipo Web Services en ARCA?

Es el número que creaste en ARCA para facturación electrónica.
(Ejemplo: 2)

¿No lo tenés? Respondé NO y te explico cómo crearlo.`;

const INSTRUCCIONES_PUNTO_VENTA = `📋 Para crear tu punto de venta en ARCA seguí estos pasos:

1️⃣ Entrá a arca.gob.ar con tu Clave Fiscal
2️⃣ Buscá "Administración de Puntos de Venta"
3️⃣ Clic en "Agregar"
4️⃣ Tipo: "Factura Electrónica - Web Services"
5️⃣ Poné un nombre (ej: Bot Facturación)
6️⃣ Guardá y anotá el número asignado

Cuando lo tengas escribime el número y continuamos. 👍`;

// Para registro (flujo de usuario desconocido)
const pedir_nombre_registro = `¿Cuál es tu nombre o razón social?`;

const pedir_email_registro = (nombre) => `¡Genial, ${nombre}! 📧 ¿Cuál es tu email? (lo uso para tu suscripción y comprobantes)`;

const PEDIR_EMAIL = `📧 ¿Cuál es tu email? (lo uso para tu suscripción y comprobantes)`;

const METODO_REGISTRO = `📝 ¿Cómo quieres registrarte?

1️⃣ Paso a paso (preguntas una por una)
2️⃣ Todo de una vez (envía todos los datos)

Respondé con 1 o 2.`;

const INSTRUCCIONES_TODO_JUNTO = `📋 Ya tengo tu CUIT y tu punto de venta configurados. Enviame estos 4 datos, en cualquier orden, separados por línea nueva:

1. Nombre o razón social
2. Email
3. Domicilio
4. Condición IVA (1=Monotributista, 2=Responsable Inscripto)

Ejemplo:
\`\`\`
Carlos Federico GUNTHER
cf@mail.com
Felix de Azara 1815
1
\`\`\``;

const onboardingCompleto = (datos) => `🎉 ¡Todo listo! Tu cuenta está configurada.

Estos son tus datos:
• CUIT: ${datos.cuit}
• Razón social: ${datos.razon_social}
• Domicilio: ${datos.domicilio}
• Condición IVA: ${datos.condicion_iva}
• Punto de venta: ${datos.punto_venta}

¿Son correctos? (SI / NO)`;

const DATOS_INCORRECTOS_ONBOARDING = `Vamos a cargarlos de nuevo.

¿Cuál es tu CUIT?
Escribilo así: 20-12345678-9`;

// ==========================================
// FLUJO 2 — EMITIR FACTURA POR TEXTO
// ==========================================

const PEDIR_NOMBRE_CLIENTE = `📋 ¿A nombre de quién va la factura?

Escribí el nombre completo o razón social del cliente.`;

const PEDIR_DOCUMENTO_CLIENTE = `🔢 ¿CUIT o documento del cliente?

• Si tiene CUIT: 20-12345678-9
• Si solo tiene DNI: DNI 12345678
• Si es consumidor final: CF`;

const DOCUMENTO_VALIDO = `✅ Documento válido.

📝 ¿Cuál es el concepto o descripción del servicio/producto?`;

const DOCUMENTO_INVALIDO = `❌ Formato incorrecto.

Intentá de nuevo:
• CUIT: 20-12345678-9
• DNI: DNI 12345678
• Consumidor final: CF`;

const PEDIR_CONCEPTO = `📝 ¿Cuál es el concepto o descripción del servicio/producto?`;

const PEDIR_IMPORTE = `💰 ¿Cuál es el importe total en pesos?

Escribí solo el número (sin puntos ni $)
Ejemplo: 15000`;

const IMPORTE_INVALIDO = `❌ El importe no es válido.

Escribí solo números, sin puntos ni $.
Ejemplo: 15000`;

const resumenFactura = (datos) => `🧾 Resumen de la factura:

• Tipo: ${datos.tipo_comprobante}
• Cliente: ${datos.razon_social_cliente}
• Documento: ${datos.documento_cliente}
• Concepto: ${datos.concepto}
• Importe: $${datos.importe}

¿Confirmás la emisión? (SI / NO)`;

const EMITIENDO_FACTURA = `⏳ Emitiendo tu factura...

Esto puede tardar unos segundos. 🔄`;

const facturaEmitida = (datos) => `✅ ¡Factura emitida correctamente!

📄 ${datos.tipo_comprobante} N° ${datos.numero_factura}
🔑 CAE: ${datos.cae}
📅 Vencimiento CAE: ${datos.vencimiento_cae}

Te adjunto el PDF 👇`;

const ERROR_ARCA_CAIDO = `😕 ARCA no está respondiendo en este momento.

Estamos reintentando automáticamente...
Si el problema persiste en unos minutos avisanos:
📱 ${process.env.NUMERO_ADMIN || ''}`;

const errorEmitirFactura = (error) => `❌ Hubo un error al emitir la factura.

Error: ${error}

Verificá los datos e intentá de nuevo.
Si el problema persiste contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}`;

const DATOS_INCORRECTOS_FACTURA = `📝 Vamos a cargar los datos de nuevo.

¿A nombre de quién va la factura?`;

// ==========================================
// FLUJO 3 — EMITIR FACTURA POR IMAGEN
// ==========================================

const IMAGEN_RECIBIDA = `📸 Recibí tu imagen, la estoy analizando...

Dame un momento. 🔍`;

const imagenAnalizada = (datos, confianza = 'alta') => {
  if (confianza === 'alta') {
    return `✅ Encontré estos datos en la imagen:

• Cliente: ${datos.razon_social || '❓ no encontrado'}
• Documento: ${datos.documento || '❓ no encontrado'}
• Concepto: ${datos.concepto || '❓ no encontrado'}
• Importe: $${datos.importe || '❓ no encontrado'}

¿Son correctos? (SI / NO)
Si algo está mal respondé NO y cargamos los datos manualmente.`;
  } else {
    return `🔍 Encontré algunos datos pero no estoy 100% seguro:

• Cliente: ${datos.razon_social || '❓ no encontrado'}
• Documento: ${datos.documento || '❓ no encontrado'}
• Concepto: ${datos.concepto || '❓ no encontrado'}
• Importe: $${datos.importe || '❓ no encontrado'}

¿Son correctos? (SI / NO)
Si algo está mal o falta respondé NO.`;
  }
};

const IMAGEN_NO_LEGIBLE = `😅 No pude leer bien la imagen.

Puede ser por la calidad o el ángulo de la foto.
Vamos a cargar los datos manualmente:

¿A nombre de quién va la factura?`;

const IMAGEN_DESACTIVADA = `📸 Por el momento no puedo interpretar imágenes.

Podés cargar los datos manualmente o mandar un 🎤 audio.

¿A nombre de quién va la factura?`;

// ==========================================
// FLUJO 4 — EMITIR FACTURA POR AUDIO
// ==========================================

const AUDIO_RECIBIDO = `🎤 Recibí tu audio, lo estoy procesando...

Dame un momento. 🔄`;

const audioProcessado = (transcripcion, datos) => `🎤 Escuché esto:
"${transcripcion}"

Los datos que entendí son:
• Cliente: ${datos.razon_social || '❓ no encontrado'}
• Documento: ${datos.documento || '❓ no encontrado'}
• Concepto: ${datos.concepto || '❓ no encontrado'}
• Importe: $${datos.importe || '❓ no encontrado'}

¿Son correctos? (SI / NO)`;

const ERROR_AUDIO = `😕 No pude procesar el audio.

Intentá de nuevo o cargá los datos manualmente:

¿A nombre de quién va la factura?`;

// ==========================================
// FLUJO 5 — VER ÚLTIMA FACTURA
// ==========================================

const ultimaFactura = (factura) => `📄 Tu última factura:

• Tipo: ${factura.tipo_comprobante}
• N°: ${factura.numero_factura}
• Fecha: ${factura.fecha_emision}
• Cliente: ${factura.razon_social_cliente}
• Concepto: ${factura.concepto}
• Importe: $${factura.importe}
• CAE: ${factura.cae}
• Vto. CAE: ${factura.vencimiento_cae}

¿Necesitás hacer algo más?
1️⃣ Emitir una nueva factura
2️⃣ Volver al menú`;

const SIN_FACTURAS = `📭 Todavía no emitiste ninguna factura desde este número.

¿Querés emitir una ahora?
1️⃣ Sí, emitir factura
2️⃣ Volver al menú`;

// ==========================================
// FLUJO 6 — VER MIS DATOS
// ==========================================

const verMisDatos = (usuario) => `👤 Tus datos registrados:

• Nombre: ${usuario.nombre}
• CUIT: ${usuario.cuit}
• Razón social: ${usuario.razon_social}
• Domicilio: ${usuario.domicilio}
• Condición IVA: ${usuario.condicion_iva}
• Punto de venta: ${usuario.punto_venta}
• Plan: ${usuario.plan}
• Vencimiento: ${new Date(usuario.fecha_vencimiento * 1000).toLocaleDateString('es-AR')}
• Facturas este mes: ${usuario.facturas_mes_actual}/${usuario.limite_facturas_mes === -1 ? '∞' : usuario.limite_facturas_mes}

Para modificar algún dato contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}`;

// ==========================================
// FLUJO 7 — BIENVENIDA (ADMIN ACTIVA USUARIO)
// ==========================================

const bienvenidaActivacion = (nombre) => `👋 ¡Hola ${nombre}! Tu cuenta de facturación electrónica fue activada.

Soy tu asistente personal para emitir facturas ante ARCA directamente desde WhatsApp. 🧾

Para comenzar escribime aquí 👇

Si tenés alguna duda estamos disponibles:
📱 ${process.env.NUMERO_ADMIN || ''}`;

// ==========================================
// FLUJO 8 — AVISO VENCIMIENTO (automático -3 días)
// ==========================================

const avisoVencimiento = (fecha, linkPago) => `⏰ Tu suscripción vence el ${fecha}.

Para renovar y seguir facturando sin interrupciones:
📱 ${process.env.NUMERO_ADMIN || ''}

O renová directamente acá:
🔗 ${linkPago}`;

// ==========================================
// FLUJO 9 — CONFIRMACIÓN DE PAGO (webhook MP)
// ==========================================

const pagoConfirmado = (fechaVencimiento) => `✅ ¡Pago confirmado!

Tu suscripción está activa hasta el ${fechaVencimiento}.

Ya podés seguir facturando. 🧾
Escribime cuando necesites emitir una factura.`;

// ==========================================
// FLUJO 10 — PAGO RECHAZADO (webhook MP)
// ==========================================

const PAGO_RECHAZADO = `⚠️ No pudimos procesar tu pago.

Por favor verificá los datos de tu tarjeta o contactanos:
📱 ${process.env.NUMERO_ADMIN || ''}

Estamos para ayudarte. 😊`;

// ==========================================
// PALABRAS CLAVE PARA DETECCIÓN DE INTENCIÓN
// ==========================================

const PALABRAS_FACTURA = ['factura', 'facturar', 'emitir', '1', 'nueva', 'hacer', 'crear'];
const PALABRAS_ULTIMA = ['última', 'ultima', 'último', 'ultimo', 'ver', '2', 'historial', 'pasada'];
const PALABRAS_DATOS = ['datos', 'cuenta', 'perfil', 'información', 'info', '3', 'mi'];
const PALABRAS_CANCELAR = ['cancelar', 'cancel', 'salir', 'exit', 'menu', 'menú', 'inicio', 'volver'];
const PALABRAS_SI = ['si', 'sí', 'yes', 'ok', 'dale', 'confirmar', 'confirmo', 'correcto', 's', 'bueno'];
const PALABRAS_NO = ['no', 'nop', 'nope', 'incorrecto', 'mal', 'n', 'negativo'];

export {
  // Sistema
  BIENVENIDA_NUEVA,
  menuPrincipal,
  NO_AUTORIZADO,
  suscripcionVencida,
  limiteFacturasAlcanzado,
  CANCELADO,
  TIMEOUT,
  ERROR_GENERAL,

  // Pre-setup ARCA automático
  PRE_SETUP_REQUERIDO,
  PRE_SETUP_CUIT_RECIBIDO,
  PRE_SETUP_PROCESANDO,
  PRE_SETUP_EXITO,
  PRE_SETUP_ERROR,

  // Registro (usuario desconocido)
  pedir_nombre_registro,
  pedir_email_registro,
  PEDIR_EMAIL,
  METODO_REGISTRO,
  INSTRUCCIONES_TODO_JUNTO,

  // Onboarding
  PEDIR_CUIT,
  CUIT_INVALIDO,
  CUIT_VALIDO,
  PEDIR_RAZON_SOCIAL,
  PEDIR_DOMICILIO,
  PEDIR_CONDICION_IVA,
  CONDICION_IVA_INVALIDA,
  PEDIR_PUNTO_VENTA,
  INSTRUCCIONES_PUNTO_VENTA,
  onboardingCompleto,
  DATOS_INCORRECTOS_ONBOARDING,

  // Emitir factura (texto)
  PEDIR_NOMBRE_CLIENTE,
  PEDIR_DOCUMENTO_CLIENTE,
  DOCUMENTO_VALIDO,
  DOCUMENTO_INVALIDO,
  PEDIR_CONCEPTO,
  PEDIR_IMPORTE,
  IMPORTE_INVALIDO,
  resumenFactura,
  EMITIENDO_FACTURA,
  facturaEmitida,
  ERROR_ARCA_CAIDO,
  errorEmitirFactura,
  DATOS_INCORRECTOS_FACTURA,

  // Emitir factura (imagen)
  IMAGEN_RECIBIDA,
  imagenAnalizada,
  IMAGEN_NO_LEGIBLE,
  IMAGEN_DESACTIVADA,

  // Emitir factura (audio)
  AUDIO_RECIBIDO,
  audioProcessado,
  ERROR_AUDIO,

  // Ver última factura
  ultimaFactura,
  SIN_FACTURAS,

  // Ver mis datos
  verMisDatos,

  // Activación y notificaciones
  bienvenidaActivacion,
  avisoVencimiento,
  pagoConfirmado,
  PAGO_RECHAZADO,

  // Palabras clave
  PALABRAS_FACTURA,
  PALABRAS_ULTIMA,
  PALABRAS_DATOS,
  PALABRAS_CANCELAR,
  PALABRAS_SI,
  PALABRAS_NO,
};
