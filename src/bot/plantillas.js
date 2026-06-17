// ==========================================
// PLANTILLAS DE MENSAJES - Todos los textos centralizados
// ==========================================
// Uso: importar MENSAJES y usar como plantilla
// Ejemplo: MENSAJES.BIENVENIDA(usuario.nombre)

export const MENSAJES = {
  // ===== ACCESO =====
  NO_REGISTRADO: `👋 Hola! Este servicio es por suscripción.

Para obtener acceso visitá nuestro sitio web o escribí al equipo de contacto.`,

  NO_ACTIVO: `❌ Tu cuenta no está activa aún.
Estamos procesando tu solicitud.`,

  SUSCRIPCION_VENCIDA: (fechaVencimiento) => {
    const fecha = fechaVencimiento.toLocaleDateString('es-AR');
    return `❌ Tu suscripción venció el ${fecha}.

Para renovar contactanos por aquí o hacé clic en el link de pago.`;
  },

  LIMITE_ALCANZADO: (limite) => `⚠️ Llegaste al límite de facturas de tu plan este mes (${limite} facturas).

Para aumentar tu límite contactanos.`,

  // ===== MENU PRINCIPAL =====
  MENU_PRINCIPAL: (nombreUsuario) => `👋 ¡Hola ${nombreUsuario}! ¿Qué querés hacer?

1️⃣ Emitir una factura
2️⃣ Ver mi última factura
3️⃣ Ver mis datos

O mandá directo una 📸 foto o 🎤 audio con los datos.`,

  // ===== FLUJO TEXTO =====
  PREGUNTA_CLIENTE: `📋 ¿A nombre de quién va la factura?
(Nombre completo o razón social)`,

  PREGUNTA_DOCUMENTO: `🔢 ¿CUIT o DNI del cliente?

Formatos válidos:
• CUIT: 20-12345678-9
• DNI: DNI 12345678
• Consumidor final: CF`,

  PREGUNTA_CONCEPTO: `✅ Perfecto.
📝 ¿Cuál es el concepto o descripción?`,

  PREGUNTA_IMPORTE: `💰 ¿Importe total en pesos?
(solo números, sin puntos ni comas)`,

  // ===== CONFIRMACIÓN =====
  CONFIRMACION_FACTURA: (datos) => `✅ Confirmá estos datos:

• Cliente: ${datos.razon_social || '❓'}
• Documento: ${datos.documento || '❓'}
• Concepto: ${datos.concepto || '❓'}
• Importe: $${datos.importe || '❓'}

¿Está bien? Respondé SI o NO`,

  CONFIRMACION_TEXTO_MALO: `📝 Vamos de nuevo. ¿A nombre de quién va la factura?`,

  // ===== IMAGEN =====
  ANALIZANDO_IMAGEN: `📸 Analizando tu imagen...`,

  IMAGEN_CONFIANZA_ALTA: (datos) => `✅ Encontré estos datos:

• Cliente: ${datos.razon_social}
• Documento: ${datos.documento}
• Concepto: ${datos.concepto}
• Importe: $${datos.importe}

¿Confirmás? Respondé SI o NO`,

  IMAGEN_CONFIANZA_MEDIA: (datos) => `🔍 Encontré estos datos, verificalos:

• Cliente: ${datos.razon_social || '❓'}
• Documento: ${datos.documento || '❓'}
• Concepto: ${datos.concepto || '❓'}
• Importe: $${datos.importe || '❓'}

¿Son correctos? Respondé SI o NO
Si algo está mal respondé NO para empezar de nuevo.`,

  IMAGEN_CONFIANZA_BAJA: `😅 No pude leer bien la imagen.
Vamos a cargar los datos manualmente.

📋 ¿A nombre de quién va la factura?`,

  // ===== AUDIO =====
  ANALIZANDO_AUDIO: `🎤 Procesando tu audio...`,

  AUDIO_TRANSCRIBIDO: (datos, texto) => `🎤 Escuché: "${texto}"

Los datos que entendí:
• Cliente: ${datos.razon_social || '❓'}
• Documento: ${datos.documento || '❓'}
• Concepto: ${datos.concepto || '❓'}
• Importe: $${datos.importe || '❓'}

¿Correcto? Respondé SI o NO`,

  // ===== EMISIÓN =====
  EMITIENDO_FACTURA: `⏳ Emitiendo factura...`,

  FACTURA_EMITIDA: (datos) => `✅ ¡Factura emitida!

📄 ${datos.tipo_comprobante} N° ${datos.numero_factura}
🔑 CAE: ${datos.cae}
📅 Vto CAE: ${datos.vencimiento_cae}
💰 Importe: $${datos.importe}`,

  ERROR_EMITIR: `❌ Hubo un error al emitir la factura.
Estamos revisando. Intentá de nuevo en unos minutos.`,

  // ===== CONSULTAS =====
  ULTIMA_FACTURA: (datos) => `📄 Tu última factura:

• Tipo: ${datos.tipo_comprobante}
• Número: ${datos.numero_factura}
• Fecha: ${datos.fecha_emision}
• Cliente: ${datos.razon_social_cliente}
• Concepto: ${datos.concepto}
• Importe: $${datos.importe}
• CAE: ${datos.cae}`,

  MIS_DATOS: (usuario) => `👤 Tus datos registrados:

• Nombre: ${usuario.nombre || '(no definido)'}
• CUIT: ${usuario.cuit || '(no definido)'}
• Razón social: ${usuario.razon_social || '(no definido)'}
• Domicilio: ${usuario.domicilio || '(no definido)'}
• Condición IVA: ${usuario.condicion_iva || '(no definido)'}
• Punto de venta: ${usuario.punto_venta || '(no definido)'}
• Plan: ${usuario.plan.toUpperCase()}
• Vencimiento: ${new Date(usuario.fecha_vencimiento * 1000).toLocaleDateString('es-AR')}
• Facturas este mes: ${usuario.facturas_mes_actual}/${usuario.limite_facturas_mes === -1 ? 'Ilimitado' : usuario.limite_facturas_mes}

Para modificar contactanos.`,

  // ===== ONBOARDING =====
  BIENVENIDA_ONBOARDING: `✅ ¡Tu cuenta está activa!

Antes de empezar necesito configurar algunos datos.

🔢 ¿Cuál es tu CUIT?
(formato: 20-12345678-9)`,

  PREGUNTA_RAZON_SOCIAL: `¿Cuál es tu razón social o nombre completo?`,

  PREGUNTA_DOMICILIO: `¿Cuál es tu domicilio fiscal?`,

  PREGUNTA_CONDICION_IVA: `¿Cuál es tu condición frente al IVA?

1️⃣ Monotributista
2️⃣ Responsable Inscripto`,

  PREGUNTA_PUNTO_VENTA: `¿Cuál es tu número de punto de venta tipo Web Services en ARCA?

(Si no lo tenés, te mando el instructivo para crearlo)`,

  NO_TENGO_PUNTO_VENTA: `Para crear tu punto de venta Web Services en ARCA:

1️⃣ Ingresá a https://serviciosweb.afip.gob.ar con tu CUIT
2️⃣ Menú: "Configuración" → "Mis Datos"
3️⃣ "Web Services de Facturación" → Crear nuevo punto de venta

Cuando lo tengas escribime el número y listo! 🎉`,

  ONBOARDING_COMPLETO: `🎉 ¡Todo configurado!

Ya podés empezar a facturar.

¿Qué querés hacer?
1️⃣ Emitir una factura
2️⃣ Ver mi última factura
3️⃣ Ver mis datos`,

  // ===== ERRORES =====
  ERROR_GENERICO: `❌ Algo salió mal.

Estamos investigando. Intentá de nuevo en unos minutos.`,

  CUIT_INVALIDO: `❌ El CUIT no es válido. Verificá el formato: 20-12345678-9`,

  IMPORTE_INVALIDO: `❌ El importe debe ser un número sin puntos ni comas.

Ejemplo: 15000 (para $15.000)`,

  // ===== CANCELACIÓN =====
  CANCELADO: `❌ Cancelado.

Escribí cualquier cosa para continuar.`
};
