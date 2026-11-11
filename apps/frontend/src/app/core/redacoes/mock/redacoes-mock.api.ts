import { Injectable } from '@angular/core';

import { CRITERIOS, Decisao, NovaRedacao, Redacao } from '../redacao.model';
import { RedacoesApi } from '../redacoes.api';
import { corrigirSimulado } from './correcao-simulada';
import { REDACOES_EXEMPLO } from './redacoes.exemplos';

const LATENCIA_MS = 250;
const LATENCIA_IA_MS = 1800;

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Implementação em memória de `RedacoesApi`. Os dados voltam ao estado inicial ao recarregar a página.
 * Aplica no "servidor" as mesmas regras que o back-end real precisará garantir (RN01 e RN02).
 */
@Injectable()
export class RedacoesMockApi extends RedacoesApi {
    private redacoes: Redacao[] = structuredClone(REDACOES_EXEMPLO);

    async listar(): Promise<Redacao[]> {
        await esperar(LATENCIA_MS);

        return structuredClone(this.redacoes);
    }

    async importar(nova: NovaRedacao): Promise<Redacao> {
        await esperar(LATENCIA_MS);

        if (!nova.consentimentoFamilia) {
            throw new Error('Sem o consentimento da família, o texto não pode entrar no sistema.');
        }

        const conteudo = nova.arquivo ? await this.lerArquivo(nova.arquivo) : nova.textoColado.trim();

        if (!conteudo) {
            throw new Error('O texto está vazio.');
        }

        const origem = nova.origemId ? this.buscar(nova.origemId) : null;
        const redacao: Redacao = {
            id: `r-${Date.now().toString(36)}`,
            aluno: nova.aluno.trim().toUpperCase(),
            turma: nova.turma.trim(),
            perfil: nova.perfil,
            titulo: nova.titulo.trim() || origem?.titulo || 'Sem título',
            versao: origem ? origem.versao + 1 : 1,
            origemId: origem?.id ?? null,
            conteudo,
            status: 'aguardando-ia',
            apontamentos: [],
            comentarioIa: '',
            comentarioProfessor: '',
            criadaEm: new Date().toISOString(),
            enviadaEm: null,
            exemplo: false,
        };

        this.redacoes = [redacao, ...this.redacoes];

        return structuredClone(redacao);
    }

    async corrigirComIa(id: string): Promise<Redacao> {
        await esperar(LATENCIA_IA_MS);

        const redacao = this.buscar(id);
        const resultado = corrigirSimulado(id, redacao.conteudo, CRITERIOS);

        return this.salvar({
            ...redacao,
            status: 'em-revisao',
            apontamentos: resultado.apontamentos,
            comentarioIa: resultado.comentario,
            comentarioProfessor: resultado.comentario,
        });
    }

    async decidir(
        id: string,
        apontamentoId: string,
        decisao: Decisao | null,
        textoProfessor?: string,
    ): Promise<Redacao> {
        await esperar(LATENCIA_MS);

        const redacao = this.buscarEmRevisao(id);

        return this.salvar({
            ...redacao,
            apontamentos: redacao.apontamentos.map((apontamento) =>
                apontamento.id === apontamentoId
                    ? {
                          ...apontamento,
                          decisao,
                          textoProfessor: decisao === 'ajustada' ? (textoProfessor?.trim() ?? null) : null,
                      }
                    : apontamento,
            ),
        });
    }

    async decidirPendentes(id: string, decisao: Exclude<Decisao, 'ajustada'>): Promise<Redacao> {
        await esperar(LATENCIA_MS);

        const redacao = this.buscarEmRevisao(id);

        return this.salvar({
            ...redacao,
            apontamentos: redacao.apontamentos.map((apontamento) =>
                apontamento.decisao ? apontamento : { ...apontamento, decisao },
            ),
        });
    }

    async salvarComentario(id: string, comentario: string): Promise<Redacao> {
        await esperar(LATENCIA_MS);

        return this.salvar({ ...this.buscarEmRevisao(id), comentarioProfessor: comentario });
    }

    async enviarDevolutiva(id: string): Promise<Redacao> {
        await esperar(LATENCIA_MS);

        const redacao = this.buscarEmRevisao(id);

        if (redacao.apontamentos.some((apontamento) => !apontamento.decisao)) {
            throw new Error('Ainda há apontamentos sem decisão do professor.');
        }

        return this.salvar({ ...redacao, status: 'devolvida', enviadaEm: new Date().toISOString() });
    }

    private buscar(id: string): Redacao {
        const redacao = this.redacoes.find((item) => item.id === id);

        if (!redacao) {
            throw new Error('Redação não encontrada.');
        }

        return redacao;
    }

    private buscarEmRevisao(id: string): Redacao {
        const redacao = this.buscar(id);

        if (redacao.status !== 'em-revisao') {
            throw new Error('Esta redação não está em revisão.');
        }

        return redacao;
    }

    private salvar(redacao: Redacao): Redacao {
        this.redacoes = this.redacoes.map((item) => (item.id === redacao.id ? redacao : item));

        return structuredClone(redacao);
    }

    private async lerArquivo(arquivo: File): Promise<string> {
        const extensao = arquivo.name.split('.').pop()?.toLowerCase();

        if (extensao === 'txt' || arquivo.type === 'text/plain') {
            return (await arquivo.text()).trim();
        }

        if (extensao === 'pdf' || extensao === 'docx') {
            throw new Error(
                'A leitura de PDF e DOCX vai ser feita pelo back-end. Por enquanto, envie TXT ou cole o texto.',
            );
        }

        throw new Error('Formato não aceito. Use PDF, TXT ou DOCX.');
    }
}
