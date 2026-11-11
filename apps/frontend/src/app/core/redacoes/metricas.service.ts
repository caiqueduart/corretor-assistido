import { Injectable, computed, inject } from '@angular/core';

import { AlunosService } from './alunos.service';
import { Apontamento, CRITERIOS, Criterio, PerfilSociolinguistico, contarPalavras } from './redacao.model';
import { RedacoesService } from './redacoes.service';

/** Diferença, em pontos percentuais, acima da média geral que dispara o alerta de possível viés. */
export const LIMIAR_ALERTA_VIES = 15;
const MINIMO_DECISOES_PARA_ALERTA = 3;

export interface LinhaCriterio {
    readonly criterio: Criterio;
    readonly aceitas: number;
    readonly ajustadas: number;
    readonly recusadas: number;
    readonly discordancia: number | null;
}

export interface LinhaPerfil {
    readonly perfil: PerfilSociolinguistico;
    readonly redacoes: number;
    readonly apontamentosPor100Palavras: number | null;
    readonly decisoes: number;
    readonly discordancia: number | null;
    readonly alerta: boolean;
}

/** Discordância = parte das decisões em que o professor recusou ou ajustou a IA. */
function discordancia(apontamentos: readonly Apontamento[]): number | null {
    const decididos = apontamentos.filter((apontamento) => apontamento.decisao);

    if (!decididos.length) {
        return null;
    }

    return Math.round(
        (100 * decididos.filter((apontamento) => apontamento.decisao !== 'aceita').length) / decididos.length,
    );
}

/** Métricas de saída da POC. Calculadas no front enquanto não houver endpoint próprio. */
@Injectable({ providedIn: 'root' })
export class MetricasService {
    private readonly redacoes = inject(RedacoesService);
    private readonly alunos = inject(AlunosService);

    private readonly corrigidas = computed(() =>
        this.redacoes.redacoes().filter((redacao) => redacao.status === 'em-revisao' || redacao.status === 'devolvida'),
    );

    private readonly todosApontamentos = computed(() => this.corrigidas().flatMap((redacao) => redacao.apontamentos));

    readonly discordanciaGeral = computed(() => discordancia(this.todosApontamentos()));

    readonly decisoesRegistradas = computed(() => this.todosApontamentos().filter((a) => a.decisao).length);

    readonly devolutivas = computed(() => ({
        enviadas: this.redacoes.redacoes().filter((redacao) => redacao.status === 'devolvida').length,
        total: this.redacoes.redacoes().length,
    }));

    readonly ganhoMedio = computed(() => {
        const variacoes = this.alunos
            .alunos()
            .map((aluno) => aluno.variacao)
            .filter((variacao): variacao is number => variacao !== null);

        return {
            alunos: variacoes.length,
            reducao: variacoes.length
                ? -Math.round(variacoes.reduce((soma, variacao) => soma + variacao, 0) / variacoes.length)
                : null,
        };
    });

    readonly porCriterio = computed<LinhaCriterio[]>(() =>
        CRITERIOS.map((criterio) => {
            const doCriterio = this.todosApontamentos().filter((apontamento) => apontamento.criterio === criterio);
            const contar = (decisao: Apontamento['decisao']) => doCriterio.filter((a) => a.decisao === decisao).length;

            return {
                criterio,
                aceitas: contar('aceita'),
                ajustadas: contar('ajustada'),
                recusadas: contar('recusada'),
                discordancia: discordancia(doCriterio),
            };
        }),
    );

    readonly porPerfil = computed<LinhaPerfil[]>(() => {
        const geral = this.discordanciaGeral();
        const perfis = [...new Set(this.corrigidas().map((redacao) => redacao.perfil))];

        return perfis
            .map((perfil) => {
                const doPerfil = this.corrigidas().filter((redacao) => redacao.perfil === perfil);
                const apontamentos = doPerfil.flatMap((redacao) => redacao.apontamentos);
                const palavras = doPerfil.reduce((soma, redacao) => soma + contarPalavras(redacao.conteudo), 0);
                const decisoes = apontamentos.filter((apontamento) => apontamento.decisao).length;
                const valor = discordancia(apontamentos);

                return {
                    perfil,
                    redacoes: doPerfil.length,
                    apontamentosPor100Palavras: palavras ? (100 * apontamentos.length) / palavras : null,
                    decisoes,
                    discordancia: valor,
                    alerta:
                        valor !== null &&
                        geral !== null &&
                        decisoes >= MINIMO_DECISOES_PARA_ALERTA &&
                        valor - geral >= LIMIAR_ALERTA_VIES,
                };
            })
            .sort((a, b) => b.redacoes - a.redacoes);
    });
}
