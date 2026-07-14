-- Registro automático + suscripción MercadoPago
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado_registro text NOT NULL DEFAULT 'nuevo';
-- estado_registro: 'nuevo' | 'reg_nombre' | 'reg_email' | 'trial' | 'esperando_pago' | 'pago_ok' | 'vencido'
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mp_subscription_id text;
-- email ya existe.
