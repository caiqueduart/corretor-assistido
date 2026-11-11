# POC 1.3: Corretor assistido de produções textuais

## Objetivo

Testar e validar uma ferramenta que usa IA para apoiar professores na correção e reescrita de textos de estudantes.

## Hipótese

O feedback assistido melhora a qualidade da reescrita sem introduzir vieses linguísticos contra variedades não padrão.

## Classificação

- **Risco:** moderado a alto
- **Coorte de entrada:** 2

## Escopo

- Autenticação e cadastro de usuários.
- Perfis de professor e de administrador do sistema.
- Envio da produção textual do aluno em arquivo (PDF, TXT ou DOCX).
- Avaliação do texto pela IA, gerando uma correção segundo os critérios definidos (ortografia e pontuação).
- Revisão do professor sobre a correção da IA: aceitar, negar ou ajustar.

## Salvaguardas

- **Mediação docente obrigatória:** o estudante nunca recebe devolutiva sem validação do professor.
- **Auditoria de equidade** por perfil sociolinguístico.
- **Consentimento informado** das famílias.

## Dados

Produções textuais dos estudantes participantes, com base legal definida e minimização de dados.

## Métricas de saída

- Ganho de qualidade entre versões do texto.
- Taxa de discordância entre professor e sistema.
- Distribuição do feedback por grupos demográficos.
