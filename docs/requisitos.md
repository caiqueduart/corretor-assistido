# Requisitos

Prioridades: **Alta** (indispensável para o lançamento), **Média** (importante, mas não impede a operação inicial), **Baixa** (desejável).

## Requisitos funcionais

| ID   | Descrição                                                                        | Prioridade |
| ---- | -------------------------------------------------------------------------------- | ---------- |
| RF01 | O usuário deve se autenticar para acessar o sistema.                             | Alta       |
| RF02 | O sistema deve permitir o cadastro de usuários.                                  | Alta       |
| RF03 | O sistema deve ter os perfis de professor e de administrador.                    | Alta       |
| RF04 | O professor deve enviar a produção textual do aluno em arquivo PDF, TXT ou DOCX. | Alta       |
| RF05 | A IA deve avaliar o texto e gerar uma correção segundo os critérios de correção. | Alta       |
| RF06 | O professor deve aceitar ou negar a correção da IA como um todo.                 | Alta       |
| RF07 | O professor deve poder ajustar o resultado da IA antes de validá-lo.             | Alta       |

## Critérios de correção

- Ortografia
- Pontuação

## Regras de negócio

| ID   | Regra                                                                                   |
| ---- | --------------------------------------------------------------------------------------- |
| RN01 | Nenhuma devolutiva chega ao estudante sem a validação do professor.                     |
| RN02 | Só entram no sistema textos de estudantes cujas famílias deram consentimento informado. |

## Requisitos não funcionais

| ID    | Descrição                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| RNF01 | Os dados dos estudantes seguem base legal definida e minimização de dados.                                   |
| RNF02 | O sistema deve permitir auditar o feedback por perfil sociolinguístico e por grupo demográfico.              |
| RNF03 | O sistema deve registrar a discordância entre professor e IA e as versões do texto, para as métricas da POC. |
