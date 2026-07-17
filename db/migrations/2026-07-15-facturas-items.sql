-- Soporte multi-ítem por factura (concepto+importe por línea, no un único campo).
-- concepto/importe se mantienen como resumen derivado (join de conceptos / suma de importes)
-- para no romper el código existente que los lee (admin panel, verUltimaFactura, etc).
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS items JSONB;
