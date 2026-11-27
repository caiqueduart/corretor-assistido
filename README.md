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

O front-end exige login, então o back-end precisa estar no ar. Em um terminal:

```bash
cd apps/backend
cp .env.example .env              # defina ADMIN_EMAIL e ADMIN_SENHA
set -a; source .env; set +a
SEED_EXEMPLOS=true go run ./cmd/server
```

Ou com Docker: `docker build -t corretor-textual apps/backend` e `docker run -p 8080:8080 -v corretor-dados:/dados --env-file apps/backend/.env corretor-textual`.

Em outro terminal, na raiz:

```bash
npm install
npm start
```

O front-end sobe em http://localhost:4200 e encaminha `/api` para `http://localhost:8080` (`apps/frontend/proxy.conf.json`), sem precisar de CORS. Entre com o e-mail e a senha do administrador definidos no `.env`. Sem `ADMIN_SENHA`, a senha gerada aparece uma única vez no log do back-end.

> **Windows com espaço no nome do usuário:** o gcc do MinGW falha ao linkar (`cannot find C:/Users/Nome`). Instale o toolchain num caminho sem espaços, ou use o Docker.

## Scripts da raiz

| Script           | O que faz                                   |
| ---------------- | ------------------------------------------- |
| `npm start`      | Sobe o front-end em modo de desenvolvimento |
| `npm run build`  | Gera o build de todos os apps               |
| `npm test`       | Roda os testes de todos os apps             |
| `npm run format` | Formata o código com Prettier               |

Testes do back-end: `cd apps/backend && go test ./...`.

## O que já fala com a API

| Área                                                   | Fonte dos dados                       |
| ------------------------------------------------------ | ------------------------------------- |
| Login e sessão                                         | API (`/api/auth`, `/api/me`)          |
| Administração: usuários, configuração, auditoria       | API (só perfil admin)                 |
| Exportação do CSV de decisões (tela Métricas)          | API (`/api/metricas/decisoes.csv`)    |
| Redações, revisão, alunos e números da tela Métricas   | Mock em memória (`RedacoesMockApi`)   |

O token de acesso fica no `localStorage` até expirar (`SESSAO_DURACAO`, 12h por padrão). Uma resposta 401 da API encerra a sessão e volta ao login.

## Redações ainda com dados mockados

As redações usam `RedacoesMockApi` (em `apps/frontend/src/app/core/redacoes/mock/`), que guarda os exemplos em memória e simula a correção da IA. Os dados voltam ao estado inicial ao recarregar a página.

As telas só falam com `RedacoesService`, que depende do contrato `RedacoesApi`. Para usar a API real, crie uma implementação HTTP desse contrato e troque o provider em `apps/frontend/src/app/app.config.ts`. Até lá, a configuração salva pelo admin (critérios, perfis e limiar de viés) vale para o back-end, mas a importação e os números da tela Métricas ainda usam os valores fixos do front.
