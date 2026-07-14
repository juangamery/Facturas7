# Facturación en producción vía delegación — Diseño

Fecha: 2026-07-14
Proyecto: Facturas7 (SaaS de facturación por WhatsApp para monotributistas AR)

## Problema

Hoy el bot emite en **homologación** con el CUIT demo de afipsdk (20409378472).
No tiene validez fiscal. Para emitir facturas reales a nombre de cada cliente,
AFIP exige que el CUIT del cliente autorice al sistema. Requisito legal, sin bypass.

Objetivo: habilitar facturación real con **mínima fricción** para el
monotributista, todo por WhatsApp, sin que tenga que generar certificados
ni entrar a ARCA (salvo que lo elija).

## Modelo elegido: delegación con certificado único

Validado contra un competidor en producción (Facturitas), que usa exactamente
este modelo (su CUIT `20416142468` como representante).

- **UN** certificado de producción, generado con **el CUIT de la empresa**
  (Facturas7 / CUIT del dueño). Se genera una sola vez.
- Cada cliente **delega** el web service de Facturación Electrónica (`wsfe`)
  a nuestro CUIT.
- Emitimos "representando a" cada cliente con **nuestro único certificado**.
- No se genera un certificado por cliente. No se guarda la clave fiscal de nadie.

### Por qué delegación y no cert-por-cliente

- Un solo certificado que administrar (el nuestro).
- El cliente nunca maneja archivos de certificado.
- Es el patrón estándar del rubro.

## Componentes

### 1. Certificado único de la empresa (setup una vez, manual del dueño)

Fuera del flujo de usuarios. Se hace una vez:

1. `create-cert-prod` con CUIT/clave fiscal de la empresa → devuelve `{cert, key}`.
2. `auth-web-service-prod` para `wsfe` con el CUIT de la empresa.
3. Guardar `cert` + `key` en variables de entorno / secret de Render:
   `AFIP_EMPRESA_CERT`, `AFIP_EMPRESA_KEY`, `AFIP_EMPRESA_CUIT`.

No entra código de usuario acá; es configuración de infraestructura. Se documenta
en un runbook aparte.

### 2. Onboarding del cliente (dos caminos, ambos por WhatsApp)

El bot ofrece elegir. Estado se guarda en Supabase por usuario.

#### 2a. Rápido (recomendado)

1. Bot pide **CUIT + clave fiscal** (una vez).
2. Backend ejecuta, en orden:
   - `delegate-web-service` — params: `cuit`=CUIT cliente, `username`=CUIT cliente,
     `password`=clave del cliente, y el CUIT representante = CUIT empresa.
     (El cliente delega el WS a nuestro CUIT.)
   - `accept-web-service-delegation` — params: `cuit`/`username`=CUIT empresa,
     `password`=clave de la empresa (la tenemos en env). Aceptamos la delegación.
   - `create-sales-point` — crea el punto de venta del cliente
     (Sistema: "Facturación Electrónica - Monotributo - Webservice").
3. Guardar en Supabase: `punto_venta`, `delegacion_estado='activa'`,
   `entorno='produccion'`. **La clave del cliente se usa en memoria y se descarta.**

#### 2b. Manual (para quien no quiere compartir la clave)

1. Bot manda tutorial (2 pasos) por WhatsApp:
   - Delegar "Facturación Electrónica" al CUIT de la empresa en
     Administrador de Relaciones de AFIP.
   - Crear punto de venta (Facturación Electrónica - Monotributo - Webservice).
2. Cliente responde "listo".
3. Backend ejecuta `accept-web-service-delegation` con la clave de la empresa.
4. Guardar estado en Supabase igual que 2a. El cliente **nunca comparte su clave**.

### 3. Emisión (representando al cliente)

Cambio en `src/facturacion/factura.js` → `crearAfip()`:

```js
function crearAfip(cuitCliente) {
  const cuit = parseInt(String(cuitCliente).replace(/\D/g, ''), 10);
  if (PRODUCCION) {
    return new Afip({
      CUIT: cuit,                        // representado (cliente)
      cert: process.env.AFIP_EMPRESA_CERT,
      key: process.env.AFIP_EMPRESA_KEY,
      access_token: ACCESS_TOKEN,
      production: true,
    });
  }
  // homologación: sin cert, CUIT demo o del cliente
  return new Afip({ CUIT: cuit, access_token: ACCESS_TOKEN, production: false });
}
```

El resto de `solicitarCAE` no cambia.

### 4. Manejo seguro de la clave fiscal (camino rápido)

- Se ingresa por WhatsApp (el cliente ya está en ese canal).
- **Nunca** se persiste: ni DB, ni logs, ni variable de entorno.
- Se usa solo en memoria durante las automatizaciones y se descarta.
- No se loguea el contenido del mensaje que la contiene.
- Riesgo residual conocido: el mensaje con la clave queda en el historial de
  WhatsApp del cliente y transita servidores de Meta. Se acepta como tradeoff de UX
  (igual que Facturitas). Mitigación futura opcional: link seguro HTTPS de un uso.

### 5. Módulo de automatizaciones

Nuevo archivo `src/facturacion/onboarding.js`:

- `delegarWebService(cuitCliente, claveCliente)` → corre `delegate-web-service`.
- `aceptarDelegacion(cuitCliente)` → corre `accept-web-service-delegation`
  con credenciales de la empresa (desde env).
- `crearPuntoVenta(cuitCliente, claveCliente, numero)` → corre `create-sales-point`.
- `activarClienteRapido(cuitCliente, claveCliente)` → orquesta las 3 en orden,
  devuelve `{punto_venta}` y no retorna ni loguea la clave.
- `activarClienteManual(cuitCliente)` → solo `aceptarDelegacion`.

Usa el SDK npm ya instalado (`afip.CreateAutomation(nombre, params, true)`).

### 6. Estado en Supabase

Agregar columnas a `usuarios` (o tabla `delegaciones`):

- `entorno` text default 'homologacion'
- `delegacion_estado` text default 'pendiente' ('pendiente'|'activa'|'error')
- `punto_venta` int (ya existe)

### 7. Switch homologación → producción

- Global: `AFIPSDK_ENTORNO` decide default.
- Por usuario: `usuarios.entorno`. Un usuario con `delegacion_estado='activa'`
  y `entorno='produccion'` emite real; el resto sigue en homologación.
- Permite migrar cliente por cliente sin tocar a los demás.

## Flujo WhatsApp (alto nivel)

```
Cliente onboardeado (CUIT+punto de venta ya cargados) pide facturar
  → si entorno=homologacion y quiere real:
      bot: "¿Activás facturación real? 1) Rápido (CUIT+clave) 2) Manual (tutorial)"
      → 1: pide clave → activarClienteRapido → estado activa
      → 2: manda tutorial → espera "listo" → activarClienteManual → estado activa
  → si entorno=produccion y delegacion=activa: emite real (flujo actual)
```

## Fuera de alcance (YAGNI)

- Link seguro HTTPS para la clave (mitigación futura, no ahora).
- Panel web de onboarding (se hace por WhatsApp).
- Cifrado en reposo del cert de la empresa (va en secret de Render, suficiente).
- Notas de crédito / anulación (otro spec).
- Multi-punto-de-venta por cliente.

## Testing

- Sandbox: `activarClienteManual` y emisión con cert de empresa en homologación
  usando un CUIT de prueba delegado.
- Verificar que la clave del cliente no aparece en logs (grep de logs tras corrida).
- Emisión real end-to-end con un CUIT real delegado (el del dueño primero).
- Confirmar que un usuario en homologación sigue funcionando sin cambios.

## Riesgos

- Automatizaciones tardan 30-90s (navegador headless de afipsdk). El bot debe
  avisar "Activando, esto tarda un momento..." y no timeoutear.
- Render free tier puede dormirse; la corrida de automatización debe manejar
  reintento/estado.
- Si la delegación falla (clave incorrecta, CUIT sin clave nivel 3), devolver
  mensaje claro y dejar `delegacion_estado='error'`.
