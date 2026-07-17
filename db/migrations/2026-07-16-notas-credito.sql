-- Soporte Nota de Crédito: rastrear qué factura anula/corrige cada NC.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS factura_original_id BIGINT REFERENCES facturas(id);
