-- Certificado generado por el setup automático (arca_automation.js / afipsdk_registro.js)
-- Sin esto, actualizarUsuario() fallaba en silencio al guardar el certificado
-- (antes del fix de db.js que ahora sí revisa errores de Supabase).
-- Reutiliza columnas 'entorno' y 'delegacion_estado' ya creadas en 2026-07-14-delegacion.sql
-- (antes se escribía por error a 'afipsdk_entorno'/'afipsdk_status', columnas que nadie leía).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS afipsdk_cert TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS afipsdk_key TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS actualizado_en INTEGER;
