# Corretor Textual 3.000 — backend (POC 1.3)

API em Go do corretor assistido de produções textuais. A IA aponta os desvios, o professor decide cada um e só então a devolutiva chega ao estudante. A API também calcula as métricas da hipótese da POC: discordância entre professor e IA, auditoria de equidade por perfil sociolinguístico e ganho de qualidade entre a 1ª versão e a reescrita.

## Como rodar

Requisitos: Go 1.24 ou mais novo e um compilador C (o driver do SQLite usa cgo).

```bash
cp .env.example .env              # ajuste ANTHROPIC_API_KEY e ADMIN_*
set -a; source .env; set +a
SEED_EXEMPLOS=true go run ./cmd/server
```

No primeiro início, o banco é criado em `./dados/corretor.db` junto com o administrador. Sem `ADMIN_SENHA`, uma senha é gerada e aparece **uma única vez** no log. `SEED_EXEMPLOS=true` carrega os 8 textos do roteiro de demonstração, os mesmos da interface.

Sem `ANTHROPIC_API_KEY`, o servidor sobe só com a correção simulada (regras fixas), suficiente para demonstrar o fluxo.

Com Docker:

```bash
docker build -t corretor-textual .
docker run -p 8080:8080 -v corretor-dados:/dados --env-file .env corretor-textual
```

Testes: `make testar` (ou `go test -race ./...`).

## Configuração

| Variável | Padrão | Para que serve |
|---|---|---|
| `ADDR` | `:8080` | Endereço HTTP |
| `DB_PATH` | `./dados/corretor.db` | Arquivo SQLite |
| `ANTHROPIC_API_KEY` | vazio | Liga a correção por IA |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Modelo usado na correção |
| `ANTHROPIC_VERSION` | `2026-10-21` | Cabeçalho `anthropic-version` |
| `CORRECAO_CONCORRENCIA` | `4` | Correções simultâneas |
| `CORRECAO_TIMEOUT` | `150s` | Tempo máximo de uma correção |
| `ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_NOME` | `admin@corretor.local`, gerada, `Administrador` | Primeiro administrador (só com o banco vazio) |
| `SESSAO_DURACAO` | `12h` | Validade do login |
| `MAX_UPLOAD_MB` | `10` | Tamanho máximo de cada arquivo |
| `CORS_ORIGENS` | vazio | Origens da interface web, separadas por vírgula |
| `STATIC_DIR` | vazio | Pasta da interface, servida em `/` |
| `SEED_EXEMPLOS` | `false` | Carrega os textos de demonstração |

## Perfis

| Perfil | Pode |
|---|---|
| `admin` | Tudo, mais critérios de correção, perfis sociolinguísticos, alerta de viés, usuários e auditoria |
| `professor` | Importar, corrigir, revisar, enviar devolutivas e carregar ou remover exemplos |
| `leitura` | Ver textos, devolutivas e métricas |

## Fluxo de um texto

`pendente` → **corrigir** → `corrigindo` → `revisao` → **decidir cada apontamento** → **enviar** → `concluido`

- A correção roda em segundo plano: `POST /corrigir` responde `202` e o status muda para `revisao` quando termina. Com `?aguardar=true`, a chamada espera o resultado.
- Se a correção falha, o texto volta ao estado anterior e `erro_correcao` explica o motivo ao professor.
- Corrigir de novo um texto em `revisao` descarta as decisões anteriores. Um texto `concluido` não pode ser corrigido de novo.
- O envio só é aceito quando todos os apontamentos têm decisão. A devolutiva mostra só os apontamentos aceitos ou editados.

Exemplo com `curl`:

```bash
B=http://localhost:8080
TOKEN=$(curl -s -X POST $B/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@escola.exemplo","senha":"..."}' | jq -r .token)
H="Authorization: Bearer $TOKEN"

# Importar dois arquivos (sem aluno_codigo, o nome do arquivo vira o código)
curl -s -X POST $B/api/textos/importar -H "$H" \
  -F arquivos=@8A-07.docx -F arquivos=@8A-08.pdf \
  -F turma="8º A" -F grupo=Rural -F consentimento=true

# Corrigir e esperar
curl -s -X POST "$B/api/textos/ID/corrigir?aguardar=true" -H "$H"

# Decidir um apontamento, ou a correção inteira
curl -s -X PATCH $B/api/textos/ID/apontamentos/AID -H "$H" -H 'content-type: application/json' \
  -d '{"decisao":"editada","sugestao_final":"para a roça"}'
curl -s -X POST $B/api/textos/ID/decisoes -H "$H" -H 'content-type: application/json' -d '{"decisao":"aceita"}'

# Enviar e ver o que o estudante recebe
curl -s -X POST $B/api/textos/ID/enviar -H "$H" -H 'content-type: application/json' -d '{"comentario":"Muito bem!"}'
curl -s $B/api/textos/ID/devolutiva -H "$H"
```

## Rotas

Documentação interativa (Swagger UI) em **`/docs/`**, a partir da especificação OpenAPI em `/docs/openapi.json` (fonte: `internal/api/docs/openapi.json`). Para testar as rotas por lá, faça o login, copie o `token` e clique em **Authorize**. Ao criar ou mudar uma rota, atualize a especificação: `TestSpecCobreRotas` falha quando ela e `servidor.go` divergem.

Todas as rotas `/api` (exceto o login) exigem `Authorization: Bearer <token>`. Os erros vêm como `{"erro":{"codigo":"...","mensagem":"..."}}`, com a mensagem pronta para mostrar ao usuário.

| Método e rota | Perfil | O que faz |
|---|---|---|
| `GET /healthz` | público | Saúde do serviço e se a IA está configurada |
| `POST /api/auth/login` | público | `{email, senha}` → `{token, expira_em, usuario}`. Bloqueia 15 min após 5 senhas erradas |
| `POST /api/auth/logout` | todos | Encerra a sessão |
| `GET /api/me` | todos | Usuário atual |
| `GET /api/config` | todos | Critérios ativos, perfis sociolinguísticos, limiar de viés e critérios disponíveis |
| `PUT /api/config` | admin | `{criterios, grupos, limiar_vies}` |
| `GET/POST /api/usuarios` | admin | Lista e cria usuários `{nome, email, senha, perfil}` |
| `PATCH /api/usuarios/{id}` | admin | Altera `nome`, `perfil`, `ativo` ou `senha` (encerra as sessões do usuário) |
| `GET /api/auditoria?limite=` | admin | Quem fez o quê, sem conteúdo dos textos |
| `GET /api/textos?status=&turma=&grupo=&aluno=` | todos | Lista textos com contagem de apontamentos e pendências |
| `POST /api/textos` | professor | Cria a partir de texto colado `{aluno_codigo, turma, grupo, titulo, conteudo, origem_id, consentimento}` |
| `POST /api/textos/importar` | professor | `multipart/form-data` com até 20 `arquivos` (PDF, TXT, DOCX) e os mesmos campos |
| `POST/DELETE /api/textos/exemplos` | professor | Carrega ou remove os textos de demonstração |
| `GET /api/textos/{id}` | todos | Texto com apontamentos |
| `DELETE /api/textos/{id}` | professor | Exclui o texto |
| `POST /api/textos/{id}/corrigir` | professor | `{motor: "ia" \| "simulado"}` opcional, `?aguardar=true` opcional |
| `PATCH /api/textos/{id}/apontamentos/{aid}` | professor | `{decisao: "aceita" \| "recusada" \| "editada" \| null, sugestao_final}` |
| `POST /api/textos/{id}/decisoes` | professor | Aceita ou recusa toda a correção |
| `PUT /api/textos/{id}/comentario` | professor | Comentário do professor para o estudante |
| `POST /api/textos/{id}/enviar` | professor | Conclui e envia a devolutiva |
| `GET /api/textos/{id}/devolutiva` | todos | Texto corrigido, segmentos para exibir e lista para a reescrita |
| `GET /api/metricas?turma=` | todos | Discordância geral e por critério, equidade por perfil, ganho entre versões |
| `GET /api/metricas/decisoes.csv` | todos | Uma linha por decisão, sem conteúdo nem código do estudante |

`inicio` e `fim` dos apontamentos são posições em **unidades UTF-16** no `conteudo`, as mesmas de `String.prototype.slice` no navegador.

## Decisões de projeto

**Privacidade (LGPD).**
- Estudantes entram por código, nunca pelo nome.
- O banco recusa texto sem consentimento (`CHECK (consentimento = 1)`).
- A IA recebe só o texto e os critérios. Código, turma e perfil sociolinguístico nunca saem do servidor.
- Logs e auditoria não guardam o conteúdo dos textos.
- Senhas usam PBKDF2-SHA256 (600 mil iterações). Os tokens de sessão são guardados só como hash.

**Correção por IA.**
- Usa a Messages API com saída estruturada (`output_config.format` com JSON Schema). O critério de cada apontamento fica restrito aos critérios ativos.
- O texto do estudante vai delimitado, e as instruções mandam ignorar pedidos escritos dentro dele.
- Erros temporários (429, 5xx, 529) são tentados de novo até 3 vezes.
- Cada apontamento é localizado no texto pelo trecho exato. Os que não correspondem a nenhum trecho são descartados e contados em `descartados`.

**Métricas.**
- Seguem as mesmas regras da interface da POC.
- Com os textos de exemplo, dão discordância geral de 26% e alerta de viés no perfil Rural (45%).
- Um grupo só gera alerta com pelo menos 3 decisões.

**Banco.** SQLite com WAL atende bem a escala da POC (algumas turmas). As consultas estão isoladas em `internal/store`, então trocar por PostgreSQL afeta só o driver, os parâmetros e as migrações.

## Estrutura

```
cmd/server          ponto de entrada, administrador inicial e encerramento gracioso
internal/api        rotas HTTP, autenticação por perfil, correção em segundo plano, OpenAPI e Swagger UI (docs/)
internal/corretor   motor da Claude API, motor simulado e localização dos trechos
internal/extracao   leitura de PDF, DOCX e TXT
internal/metricas   discordância, equidade e ganho entre versões
internal/store      SQLite, migrações e consultas
internal/exemplos   os 8 textos do roteiro de demonstração
```

## Limitações e próximos passos

- PDFs digitalizados (imagem) são recusados com uma mensagem pedindo OCR. Redações manuscritas exigiriam reconhecimento de escrita.
- O login é por e-mail e senha. Login institucional (Google Workspace, gov.br) depende de decisão dos stakeholders.
- A interface publicada ainda guarda os dados no próprio artefato. O próximo passo é apontá-la para esta API.
