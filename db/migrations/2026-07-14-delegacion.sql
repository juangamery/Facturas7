-- Estado de delegación y entorno por usuario (facturación en producción)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS entorno text NOT NULL DEFAULT 'homologacion';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS delegacion_estado text NOT NULL DEFAULT 'pendiente';
-- delegacion_estado: 'pendiente' | 'activa' | 'error'
-- punto_venta ya existe en la tabla.
