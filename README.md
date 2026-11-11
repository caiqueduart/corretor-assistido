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
