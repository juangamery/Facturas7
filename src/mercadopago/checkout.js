// ==========================================
// PÁGINA DE CHECKOUT (Mercado Pago Checkout Bricks)
// ==========================================
// El bot manda un link acá. El cliente tokeniza su tarjeta con el SDK
// de MP (nunca vemos el número de tarjeta) y recién ahí, en /procesar,
// creamos la suscripción real con ese token.

import { obtenerUsuarioPorID, actualizarUsuario } from '../db.js';
import { crearSuscripcionConTarjeta } from './suscripcion.js';
import { logger, logearError } from '../logger.js';

const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const PRECIO_BASICO = parseInt(process.env.MP_PRECIO_BASICO || '299', 10);

export async function mostrarCheckout(req, res) {
  try {
    const usuario = await obtenerUsuarioPorID(req.params.usuarioId);
    if (!usuario) {
      return res.status(404).send('Usuario no encontrado.');
    }
    if (!MP_PUBLIC_KEY) {
      return res.status(500).send('Checkout no configurado (falta MP_PUBLIC_KEY).');
    }

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Facturas7 - Suscripción</title>
<script src="https://sdk.mercadopago.com/js/v2"></script>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 420px; margin: 40px auto; padding: 0 16px; }
  h1 { font-size: 20px; }
  #status { margin-top: 16px; padding: 12px; border-radius: 8px; display: none; }
  #status.ok { background: #d4edda; color: #155724; display: block; }
  #status.error { background: #f8d7da; color: #721c24; display: block; }
</style>
</head>
<body>
  <h1>Facturas7 — Suscripción mensual</h1>
  <p>$${PRECIO_BASICO} ARS / mes. Cancelás cuando quieras.</p>
  <div id="cardPaymentBrick_container"></div>
  <div id="status"></div>

  <script>
    const mp = new MercadoPago('${MP_PUBLIC_KEY}', { locale: 'es-AR' });
    const bricksBuilder = mp.bricks();

    const renderCardPaymentBrick = async (bricksBuilder) => {
      const settings = {
        initialization: { amount: ${PRECIO_BASICO} },
        callbacks: {
          onReady: () => {},
          onSubmit: (formData) => {
            return new Promise((resolve, reject) => {
              fetch('/checkout/${usuario.id}/procesar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
              })
                .then((r) => r.json())
                .then((r) => {
                  const el = document.getElementById('status');
                  if (r.exito) {
                    el.className = 'ok';
                    el.textContent = '✅ ¡Listo! Tu suscripción está activa. Ya podés volver a WhatsApp.';
                  } else {
                    el.className = 'error';
                    el.textContent = '❌ ' + (r.error || 'No pudimos procesar el pago. Intentá de nuevo.');
                  }
                  resolve();
                })
                .catch(() => {
                  const el = document.getElementById('status');
                  el.className = 'error';
                  el.textContent = '❌ Error de conexión. Intentá de nuevo.';
                  reject();
                });
            });
          },
          onError: (error) => { console.error(error); },
        },
      };
      window.cardPaymentBrickController = await bricksBuilder.create(
        'cardPayment',
        'cardPaymentBrick_container',
        settings,
      );
    };
    renderCardPaymentBrick(bricksBuilder);
  </script>
</body>
</html>`);
  } catch (error) {
    logearError(error, 'mostrarCheckout');
    res.status(500).send('Error interno.');
  }
}

export async function procesarCheckout(req, res) {
  try {
    const usuario = await obtenerUsuarioPorID(req.params.usuarioId);
    if (!usuario) {
      return res.status(404).json({ exito: false, error: 'Usuario no encontrado' });
    }

    const { token, payer } = req.body || {};
    if (!token) {
      return res.status(400).json({ exito: false, error: 'Falta el token de la tarjeta' });
    }

    const payerEmail = payer?.email || usuario.email;
    const resultado = await crearSuscripcionConTarjeta(usuario, token, payerEmail);

    if (!resultado) {
      return res.status(502).json({ exito: false, error: 'Mercado Pago rechazó la operación' });
    }

    await actualizarUsuario(usuario.id, { mp_subscription_id: resultado.id });
    logger.info(`💳 Checkout completado para usuario ${usuario.id}, suscripción ${resultado.id} (${resultado.status})`);

    // El webhook de MP confirma el estado final (authorized) y activa al usuario.
    res.json({ exito: true, status: resultado.status });
  } catch (error) {
    logearError(error, 'procesarCheckout');
    res.status(500).json({ exito: false, error: 'Error interno' });
  }
}
