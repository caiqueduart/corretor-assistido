# Product

<!-- impeccable:product-schema 1 -->

> Registro inferido de `docs/poc.md`, `docs/requisitos.md`, do protótipo da outra equipe e do pedido do Caique em 2026-11-11. Itens marcados com _(inferido)_ ainda precisam de confirmação.

## Platform

web

## Users

- **Professor de Língua Portuguesa** do ensino fundamental (8º e 9º ano, _inferido do protótipo_). Importa as produções dos alunos, revisa a correção da IA e libera a devolutiva. É quem usa a ferramenta no dia a dia, geralmente no computador da escola ou de casa, com várias redações por turma.
- **Administrador do sistema**: cadastra usuários e define os critérios de correção.
- **Estudante**: não acessa o sistema nesta POC; recebe apenas a devolutiva validada pelo professor.

## Product Purpose

Corretor assistido de produções textuais (POC 1.3). A IA aponta desvios de ortografia e pontuação; o professor aceita, recusa ou ajusta cada apontamento (ou a correção inteira) antes de qualquer devolutiva. A POC testa a hipótese de que o feedback assistido melhora a reescrita sem introduzir vieses contra variedades linguísticas não padrão.

Sucesso: professor revisa uma redação em poucos minutos, entende sem esforço o que já decidiu e o que falta, e acompanha a evolução do aluno entre a 1ª versão e a reescrita.

## Positioning

A IA nunca fala direto com o estudante. O professor é o filtro obrigatório e a discordância dele com a IA é dado da pesquisa (taxa de discordância, auditoria de equidade).

## Operating Context

Fluxo: importar texto (PDF, TXT ou DOCX) com código do aluno, turma, perfil sociolinguístico e consentimento da família → IA corrige → professor revisa apontamento a apontamento → envia devolutiva → aluno reescreve → v2 entra no mesmo ciclo e mostra o ganho.

## Capabilities and Constraints

- Critérios de correção da POC: ortografia e pontuação.
- RN01: nenhuma devolutiva chega ao estudante sem validação do professor.
- RN02: só entram textos com consentimento informado da família.
- Estudantes são identificados por código, nunca por nome. Perfil sociolinguístico não vai para a IA.
- Apontamentos que tratam variação linguística (regional, oralidade) como erro devem ficar visíveis como tal.
- Back-end ainda não existe: o front usa dados mockados atrás de serviços, a serem trocados pelas APIs.
- Stack: Angular 21 (standalone, zoneless, signals), SCSS.

## Evidence on Hand

- Textos de exemplo do protótipo (8 produções sintéticas de 8º e 9º ano). São fictícios e devem continuar rotulados como exemplo.
- Não há logotipo, identidade visual oficial nem depoimentos.

## Product Principles

1. O professor decide; a interface deixa sempre claro o que é sugestão da IA e o que já foi validado.
2. Uma tarefa por tela: revisar é o centro, o resto fica fora do caminho.
3. Variação linguística não é erro; a interface ajuda o professor a perceber a diferença.
4. Dados mínimos e explícitos sobre o aluno.

## Accessibility & Inclusion

Uso prolongado de leitura: texto do aluno com boa medida e contraste; decisões de aceitar/recusar operáveis por teclado; estados não dependem só de cor.
