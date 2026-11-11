-- Esquema inicial do Corretor Textual 3.000 (POC 1.3).
-- Datas em milissegundos desde a época Unix (UTC).

CREATE TABLE usuarios (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT NOT NULL,
  perfil      TEXT NOT NULL CHECK (perfil IN ('admin', 'professor', 'leitura')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   INTEGER NOT NULL
);

CREATE TABLE sessoes (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em   INTEGER NOT NULL,
  expira_em   INTEGER NOT NULL
);
CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id);

CREATE TABLE configuracao (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  criterios       TEXT NOT NULL,
  grupos          TEXT NOT NULL,
  limiar_vies     INTEGER NOT NULL,
  atualizado_em   INTEGER NOT NULL,
  atualizado_por  TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE textos (
  id                    TEXT PRIMARY KEY,
  aluno_codigo          TEXT NOT NULL,
  turma                 TEXT NOT NULL DEFAULT '',
  grupo                 TEXT NOT NULL,
  titulo                TEXT NOT NULL DEFAULT '',
  versao                INTEGER NOT NULL DEFAULT 1 CHECK (versao IN (1, 2)),
  origem_id             TEXT REFERENCES textos(id) ON DELETE SET NULL,
  conteudo              TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('pendente', 'corrigindo', 'revisao', 'concluido')),
  -- Sem consentimento informado da família o texto não entra na experimentação.
  consentimento         INTEGER NOT NULL CHECK (consentimento = 1),
  exemplo               INTEGER NOT NULL DEFAULT 0,
  motor                 TEXT NOT NULL DEFAULT '',
  criterios_usados      TEXT NOT NULL DEFAULT '[]',
  comentario_ia         TEXT NOT NULL DEFAULT '',
  comentario_professor  TEXT NOT NULL DEFAULT '',
  descartados           INTEGER NOT NULL DEFAULT 0,
  erro_correcao         TEXT NOT NULL DEFAULT '',
  criado_por            TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em             INTEGER NOT NULL,
  atualizado_em         INTEGER NOT NULL,
  avaliado_em           INTEGER,
  enviado_em            INTEGER,
  enviado_por           TEXT REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_textos_status ON textos(status);
CREATE INDEX idx_textos_turma ON textos(turma);
CREATE INDEX idx_textos_origem ON textos(origem_id);

CREATE TABLE apontamentos (
  id              TEXT PRIMARY KEY,
  texto_id        TEXT NOT NULL REFERENCES textos(id) ON DELETE CASCADE,
  ordem           INTEGER NOT NULL,
  criterio        TEXT NOT NULL,
  trecho          TEXT NOT NULL,
  inicio          INTEGER NOT NULL,
  fim             INTEGER NOT NULL,
  sugestao        TEXT NOT NULL,
  explicacao      TEXT NOT NULL DEFAULT '',
  variacao        INTEGER NOT NULL DEFAULT 0,
  decisao         TEXT CHECK (decisao IN ('aceita', 'recusada', 'editada')),
  sugestao_final  TEXT,
  decidido_por    TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  decidido_em     INTEGER
);
CREATE INDEX idx_apontamentos_texto ON apontamentos(texto_id, ordem);

CREATE TABLE auditoria (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   TEXT,
  acao         TEXT NOT NULL,
  entidade     TEXT NOT NULL DEFAULT '',
  entidade_id  TEXT NOT NULL DEFAULT '',
  detalhe      TEXT NOT NULL DEFAULT '',
  criado_em    INTEGER NOT NULL
);
CREATE INDEX idx_auditoria_criado ON auditoria(criado_em);
