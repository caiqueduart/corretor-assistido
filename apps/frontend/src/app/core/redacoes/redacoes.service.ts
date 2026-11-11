import { Injectable, Signal, computed, inject, signal } from '@angular/core';

import { Decisao, NovaRedacao, Redacao } from './redacao.model';
import { RedacoesApi } from './redacoes.api';

/** Estado das redações na tela. Toda escrita passa pela `RedacoesApi`. */
@Injectable({ providedIn: 'root' })
export class RedacoesService {
    private readonly api = inject(RedacoesApi);

    private readonly estado = signal<Redacao[]>([]);
    private readonly emAndamento = signal<ReadonlySet<string>>(new Set());
    private carregamento: Promise<void> | null = null;

    readonly redacoes = this.estado.asReadonly();
    readonly carregado = signal(false);

    readonly porStatus = computed(() => {
        const ordenadas = [...this.estado()].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));

        return {
            emRevisao: ordenadas.filter((redacao) => redacao.status === 'em-revisao'),
            aguardandoIa: ordenadas.filter(
                (redacao) => redacao.status === 'aguardando-ia' || redacao.status === 'corrigindo',
            ),
            devolvidas: ordenadas.filter((redacao) => redacao.status === 'devolvida'),
        };
    });

    carregar(): Promise<void> {
        this.carregamento ??= this.api.listar().then((redacoes) => {
            this.estado.set(redacoes);
            this.carregado.set(true);
        });

        return this.carregamento;
    }

    redacao(id: Signal<string>): Signal<Redacao | undefined> {
        return computed(() => this.estado().find((redacao) => redacao.id === id()));
    }

    ocupada(id: string): boolean {
        return this.emAndamento().has(id);
    }

    async importar(nova: NovaRedacao): Promise<Redacao> {
        const redacao = await this.api.importar(nova);
        this.estado.update((lista) => [redacao, ...lista]);

        return redacao;
    }

    async corrigirComIa(id: string): Promise<void> {
        this.substituirLocal(id, (redacao) => ({ ...redacao, status: 'corrigindo' }));

        try {
            await this.executar(id, () => this.api.corrigirComIa(id));
        } catch (erro) {
            this.substituirLocal(id, (redacao) => ({ ...redacao, status: 'aguardando-ia' }));
            throw erro;
        }
    }

    /** Atualiza a tela na hora e confirma no servidor; em caso de falha, volta ao estado anterior. */
    async decidir(id: string, apontamentoId: string, decisao: Decisao | null, textoProfessor?: string): Promise<void> {
        const anterior = this.estado().find((redacao) => redacao.id === id);

        this.substituirLocal(id, (redacao) => ({
            ...redacao,
            apontamentos: redacao.apontamentos.map((apontamento) =>
                apontamento.id === apontamentoId
                    ? {
                          ...apontamento,
                          decisao,
                          textoProfessor: decisao === 'ajustada' ? (textoProfessor ?? null) : null,
                      }
                    : apontamento,
            ),
        }));

        try {
            await this.api.decidir(id, apontamentoId, decisao, textoProfessor);
        } catch (erro) {
            const original = anterior?.apontamentos.find((apontamento) => apontamento.id === apontamentoId);

            if (original) {
                this.substituirLocal(id, (redacao) => ({
                    ...redacao,
                    apontamentos: redacao.apontamentos.map((apontamento) =>
                        apontamento.id === apontamentoId ? original : apontamento,
                    ),
                }));
            }

            throw erro;
        }
    }

    decidirPendentes(id: string, decisao: Exclude<Decisao, 'ajustada'>): Promise<void> {
        return this.executar(id, () => this.api.decidirPendentes(id, decisao));
    }

    salvarComentario(id: string, comentario: string): Promise<void> {
        return this.executar(id, () => this.api.salvarComentario(id, comentario));
    }

    enviarDevolutiva(id: string): Promise<void> {
        return this.executar(id, () => this.api.enviarDevolutiva(id));
    }

    private async executar(id: string, chamada: () => Promise<Redacao>): Promise<void> {
        this.emAndamento.update((ids) => new Set(ids).add(id));

        try {
            const atualizada = await chamada();
            this.substituirLocal(id, () => atualizada);
        } finally {
            this.emAndamento.update((ids) => {
                const proximos = new Set(ids);
                proximos.delete(id);

                return proximos;
            });
        }
    }

    private substituirLocal(id: string, atualizar: (redacao: Redacao) => Redacao): void {
        this.estado.update((lista) => lista.map((redacao) => (redacao.id === id ? atualizar(redacao) : redacao)));
    }
}
