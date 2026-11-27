# Requisitos

Prioridades: **Alta** (indispensável para o lançamento), **Média** (importante, mas não impede a operação inicial), **Baixa** (desejável).

## Requisitos funcionais

| ID   | Descrição                                                                          | Prioridade |
| ---- | ---------------------------------------------------------------------------------- | ---------- |
| RF01 | O usuário deve se autenticar para acessar o sistema.                               | Alta       |
| RF02 | O sistema deve permitir o cadastro de usuários.                                    | Alta       |
| RF03 | O sistema deve ter os perfis de professor e de administrador.                      | Alta       |
| RF04 | O professor deve enviar a produção textual do aluno em arquivo PDF, TXT ou DOCX.   | Alta       |
| RF05 | A IA deve avaliar o texto e gerar uma correção segundo os critérios de correção.   | Alta       |
| RF06 | O professor deve aceitar ou negar a correção da IA como um todo.                   | Alta       |
| RF07 | O professor deve poder ajustar o resultado da IA antes de validá-lo.               | Alta       |
| RF08 | O administrador deve cadastrar os professores e os demais usuários.                | Alta       |
| RF09 | O professor deve gerar a devolutiva validada em PDF para entregar ao aluno.        | Alta       |
| RF10 | O professor deve organizar as redações em propostas (tema, gênero, turmas, prazo). | Média      |

## Perfis

| Perfil        | Pode                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Administrador | Cadastrar e gerenciar usuários, definir critérios e perfis sociolinguísticos, ver a auditoria.                                 |
| Professor     | Criar propostas, importar redações, pedir a correção da IA, aceitar, recusar ou ajustar, registrar a devolutiva e gerar o PDF. |

O estudante não acessa o sistema: é identificado só por código e recebe do professor o PDF da devolutiva validada. O administrador não corrige redações.

## Critérios de correção

- Ortografia
- Pontuação

## Regras de negócio

| ID   | Regra                                                                                   |
| ---- | --------------------------------------------------------------------------------------- |
| RN01 | Nenhuma devolutiva chega ao estudante sem a validação do professor.                     |
| RN02 | Só entram no sistema textos de estudantes cujas famílias deram consentimento informado. |
| RN03 | Só o professor importa, corrige, valida e registra devolutivas.                         |
| RN04 | O PDF da devolutiva só pode ser gerado depois do registro, com as correções validadas.  |

## Requisitos não funcionais

| ID    | Descrição                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| RNF01 | Os dados dos estudantes seguem base legal definida e minimização de dados.                                   |
| RNF02 | O sistema deve permitir auditar o feedback por perfil sociolinguístico e por grupo demográfico.              |
| RNF03 | O sistema deve registrar a discordância entre professor e IA e as versões do texto, para as métricas da POC. |
