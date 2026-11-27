-- Propostas de redação: o professor cria o tema e importa as redações dentro dela.
CREATE TABLE propostas (
  id             TEXT PRIMARY KEY,
  tema           TEXT NOT NULL,
  genero         TEXT NOT NULL,
  enunciado      TEXT NOT NULL DEFAULT '',
  turmas         TEXT NOT NULL DEFAULT '[]',  -- JSON com as turmas
  prazo          TEXT,                        -- AAAA-MM-DD (informativo)
  encerrada      INTEGER NOT NULL DEFAULT 0,
  criado_por     TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      INTEGER NOT NULL,
  atualizado_em  INTEGER NOT NULL
);
CREATE INDEX idx_propostas_criado ON propostas(criado_em);

-- Redações antigas continuam sem proposta ("avulsas").
ALTER TABLE textos ADD COLUMN proposta_id TEXT REFERENCES propostas(id) ON DELETE SET NULL;
CREATE INDEX idx_textos_proposta ON textos(proposta_id);
