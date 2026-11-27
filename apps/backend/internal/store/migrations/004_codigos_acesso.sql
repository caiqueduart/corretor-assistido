-- Códigos de acesso: o aluno envia redações e vê devolutivas sem conta, só com o código.
-- O código fica guardado só como hash; o professor vê o código uma vez, ao gerar.
CREATE TABLE codigos_acesso (
  id            TEXT PRIMARY KEY,
  aluno_codigo  TEXT NOT NULL,
  turma         TEXT NOT NULL,
  grupo         TEXT NOT NULL,                -- perfil sociolinguístico usado nas entregas
  codigo_hash   TEXT NOT NULL UNIQUE,
  criado_por    TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     INTEGER NOT NULL,
  ultimo_uso    INTEGER,
  revogado_em   INTEGER
);
-- No máximo um código ativo por aluno.
CREATE UNIQUE INDEX idx_codigos_aluno_ativo ON codigos_acesso(aluno_codigo) WHERE revogado_em IS NULL;

-- Quem enviou a redação: o professor (importação) ou o próprio aluno (código de acesso).
ALTER TABLE textos ADD COLUMN origem_envio TEXT NOT NULL DEFAULT 'professor' CHECK (origem_envio IN ('professor', 'aluno'));
