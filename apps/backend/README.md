# Back-end

Esta pasta vai abrigar a API do Corretor Assistido de produções textuais.

A equipe ainda não escolheu a stack do back-end (linguagem, framework, banco de dados e forma de integração com a IA). Por isso, ainda não há código aqui.

## O que o back-end precisa atender

Segundo a Especificação de Requisitos (POC 1.3), o back-end deve cobrir:

- Autenticação e cadastro de usuários.
- Perfis de professor e de administrador do sistema.
- Recebimento da produção textual do aluno em arquivo (PDF, TXT ou DOCX).
- Integração com a IA, que avalia o texto e gera uma correção segundo os critérios definidos (por enquanto, ortografia e pontuação).
- Revisão do professor: aceitar ou negar toda a correção e ajustar o resultado da IA quando necessário.

## Próximos passos

1. Definir a stack e registrar a decisão neste README.
2. Inicializar o projeto nesta pasta (`apps/backend`), com um `package.json` se a stack for Node.js, para que ele entre nos workspaces do monorepo.
