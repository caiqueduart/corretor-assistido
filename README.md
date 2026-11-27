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

## Demonstração rápida

Para apresentar o sistema com dados fictícios (5 propostas, 30 alunos, mais de 50 redações em todas as situações, decisões, alerta de viés e histórico):

```bash
cd apps/backend
go run ./cmd/demo -recriar               # cria dados/demo.db (pode rodar de novo para recomeçar)
DB_PATH=dados/demo.db go run ./cmd/server
```

E, em outro terminal, `npm start` na raiz. O comando mostra as contas (admin, professores e leitura) e os códigos da Área do aluno (`DEMO-0001` a `DEMO-0003`, em http://localhost:4200/aluno). Em `dados/` ficam também a lista de chamada fictícia (importe em **Alunos › Importar cópia** para ver nomes no lugar dos apelidos) e todos os códigos dos alunos.

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

## Como o front usa a API

Todas as telas usam o back-end:

| Área                                                 | Rotas                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Login e sessão                                       | `/api/auth`, `/api/me`                                     |
| Propostas de redação (tema, gênero, turmas, prazo)   | `/api/propostas`                                           |
| Alunos › Acesso dos alunos (códigos de acesso)       | `/api/codigos`                                             |
| Área do aluno (`/aluno`, sem login, só com o código) | `/api/aluno/*`                                             |
| Redações: importar, corrigir, revisar, enviar        | `/api/textos` (`RedacoesHttpApi`)                          |
| Alunos                                               | `/api/textos?completo=true`, calculadas na tela            |
| Administração: usuários, configuração, auditoria     | `/api/usuarios`, `/api/config`, `/api/auditoria`           |
| Administração › Métricas (só admin)                  | `/api/textos?completo=true` e `/api/metricas/decisoes.csv` |

- O token de acesso fica no `localStorage` até expirar (`SESSAO_DURACAO`, 12h por padrão). Uma resposta 401 encerra a sessão e volta ao login.
- A configuração do admin (critérios, perfis sociolinguísticos e limiar de viés) vale na importação e nas métricas.
- A correção espera o resultado (`?aguardar=true`). Sem `ANTHROPIC_API_KEY`, o back-end usa o motor simulado.
- O perfil `leitura` vê tudo, mas não importa, corrige, decide nem envia.
- Com o banco vazio, a tela de Redações oferece "Carregar textos de exemplo".
- Propostas organizam as redações por atividade: a importação pode escolher a proposta (turma e título vêm dela), e a fila, as métricas e o CSV filtram por proposta. Proposta encerrada não recebe redações novas.
- Alunos são identificados por apelidos de fauna e flora ("Ipê Lilás"). O nome real é opcional e fica só no navegador do professor (lista de chamada local), nunca no servidor.
- O professor importa as redações **ou** o aluno envia pela Área do aluno (`/aluno`) com o código de acesso gerado em **Alunos › Preparar turma**. O código fica só como hash no servidor e aparece uma única vez. A devolutiva só aparece para o aluno depois que o professor envia.
- `RedacoesMockApi` (em `core/redacoes/mock/`) fica só para os testes.
