# Corretor Assistido

Corretor assistido de produções textuais (POC 1.3): uma ferramenta que usa IA para apoiar professores na correção e reescrita de textos de estudantes.

## Estrutura

```
corretor-assistido/
├── apps/
│   ├── frontend/   # App Angular
│   └── backend/    # API em Go (SQLite), ver apps/backend/README.md
├── docs/           # POC e requisitos
├── package.json    # Raiz do monorepo (npm workspaces)
└── README.md
```

## Requisitos

- Node.js 22 ou superior e npm 11 (front-end)
- Go 1.24 ou superior e um compilador C (back-end; o driver do SQLite usa cgo). Alternativa: Docker.

## Como rodar

Com o Docker Desktop instalado, um comando na raiz sobe tudo:

```bash
npm install                       # só na primeira vez
npm run dev
```

O `npm run dev` (`scripts/dev.mjs`) cria `apps/backend/.env` a partir do exemplo se ele não existir (defina `ADMIN_SENHA` com 10+ caracteres), abre o Docker Desktop se estiver fechado, constrói e sobe o back-end no contêiner `corretor-assistido` (`docker-compose.yml`) e, quando ele responde, inicia o front-end. O banco fica no volume `corretor-dados` e continua entre execuções; o contêiner reinicia sozinho com o Docker.

Sem Docker, dá para rodar o back-end com Go:

```bash
cd apps/backend
cp .env.example .env
set -a; source .env; set +a
SEED_EXEMPLOS=true go run ./cmd/server
```

O front-end sobe em http://localhost:4200 e encaminha `/api` para `http://localhost:8080` (`apps/frontend/proxy.conf.json`), sem precisar de CORS. Entre com o e-mail e a senha do administrador definidos no `.env` e cadastre um professor em Administração › Usuários: é com ele que se corrige. Sem `ADMIN_SENHA`, a senha gerada aparece uma única vez no log do back-end.

> **Windows com espaço no nome do usuário:** o gcc do MinGW falha ao linkar (`cannot find C:/Users/Nome`). Instale o toolchain num caminho sem espaços, ou use o Docker.

## Scripts da raiz

| Script               | O que faz                                     |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Sobe back-end (Docker) e front-end            |
| `npm start`          | Sobe o front-end em modo de desenvolvimento   |
| `npm run back:parar` | Para o contêiner do back-end (os dados ficam) |
| `npm run back:logs`  | Mostra o log do back-end                      |
| `npm run build`      | Gera o build de todos os apps                 |
| `npm test`           | Roda os testes de todos os apps               |
| `npm run format`     | Formata o código com Prettier                 |

Testes do back-end: `cd apps/backend && go test ./...`.

## Como o front usa a API

Todas as telas usam o back-end:

| Área                                                                | Perfil    | Rotas                                            |
| ------------------------------------------------------------------- | --------- | ------------------------------------------------ |
| Login e sessão                                                      | todos     | `/api/auth`, `/api/me`                           |
| Redações: importar, corrigir, validar, registrar, PDF da devolutiva | professor | `/api/textos` (`RedacoesHttpApi`)                |
| Administração: usuários, configuração, auditoria                    | admin     | `/api/usuarios`, `/api/config`, `/api/auditoria` |

Perfis (os mesmos da POC): o **administrador** cadastra professores e outros usuários e cuida da configuração e da auditoria, sem corrigir redações. O **professor** importa, corrige, valida e registra a devolutiva. Depois do registro, o botão "Gerar PDF para o aluno" abre a impressão do navegador só com a devolutiva; escolha "Salvar como PDF". O estudante não tem login. As telas de evolução do aluno e de métricas da POC ainda não fazem parte desta versão (as rotas `/api/metricas` do back-end continuam disponíveis).

- O token de acesso fica no `localStorage` até expirar (`SESSAO_DURACAO`, 12h por padrão). Uma resposta 401 encerra a sessão e volta ao login.
- A configuração do admin (critérios, perfis sociolinguísticos e limiar de viés) vale na importação.
- A correção espera o resultado (`?aguardar=true`). Sem `ANTHROPIC_API_KEY`, o back-end usa o motor simulado.
- Com o banco vazio, a tela de Redações oferece "Carregar textos de exemplo".
- `RedacoesMockApi` (em `core/redacoes/mock/`) fica só para os testes.
