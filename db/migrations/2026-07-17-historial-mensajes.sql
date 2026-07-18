-- Historial de mensajes por conversación (memoria real, no solo el paso actual).
-- Se usa como contexto para Groq, para que no vuelva a preguntar algo que el
-- usuario ya dijo en un turno anterior de la misma sesión.
CREATE TABLE IF NOT EXISTS mensajes_historial (
  id BIGSERIAL PRIMARY KEY,
  numero_telefono TEXT NOT NULL,
  rol TEXT NOT NULL, -- 'user' | 'bot'
  contenido TEXT NOT NULL,
  creado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mensajes_historial_telefono ON mensajes_historial(numero_telefono, creado_en);
