# Corretor Assistido

Corretor assistido de produções textuais (POC 1.3): uma ferramenta que usa IA para apoiar professores na correção e reescrita de textos de estudantes.

## Estrutura

```
corretor-assistido/
├── apps/
│   ├── frontend/   # App Angular
│   └── backend/    # API (stack ainda a definir)
├── docs/           # POC e requisitos
├── package.json    # Raiz do monorepo (npm workspaces)
└── README.md
```

## Requisitos

- Node.js 22 ou superior
- npm 11

## Como rodar

```bash
npm install
npm start
```

O front-end sobe em http://localhost:4200.

## Scripts da raiz

| Script           | O que faz                                   |
| ---------------- | ------------------------------------------- |
| `npm start`      | Sobe o front-end em modo de desenvolvimento |
| `npm run build`  | Gera o build de todos os apps               |
| `npm test`       | Roda os testes de todos os apps             |
| `npm run format` | Formata o código com Prettier               |

## Front-end com dados mockados

Enquanto o back-end não existe, o front usa `RedacoesMockApi` (em `apps/frontend/src/app/core/redacoes/mock/`), que guarda as redações de exemplo em memória e simula a correção da IA. Os dados voltam ao estado inicial ao recarregar a página.

As telas só falam com `RedacoesService`, que depende do contrato `RedacoesApi`. Para usar a API real, crie uma implementação HTTP desse contrato e troque o provider em `apps/frontend/src/app/app.config.ts`.
