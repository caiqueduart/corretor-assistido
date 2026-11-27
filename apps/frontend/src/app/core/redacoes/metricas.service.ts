import { Injectable, computed, inject, signal } from '@angular/core';

import { AlunosService } from './alunos.service';
import { ConfigService } from '../admin/config.service';
import { Apontamento, Criterio, PerfilSociolinguistico, contarPalavras } from './redacao.model';
import { RedacoesService } from './redacoes.service';

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
    private readonly config = inject(ConfigService);

    /** Proposta em análise ('' = todas as redações). Vale para a tela e para o CSV. */
    readonly proposta = signal('');

    /** Redações consideradas, conforme o filtro de proposta. */
    private readonly base = computed(() => {
        const proposta = this.proposta();
        const todas = this.redacoes.redacoes();

        return proposta ? todas.filter((redacao) => redacao.propostaId === proposta) : todas;
    });

    /** Diferença, em pontos percentuais, acima da média geral que dispara o alerta (definida pelo admin). */
    readonly limiar = computed(() => this.config.limiarVies());

    /** Critérios ativos, mais os que aparecem em correções antigas (ex.: um critério desligado depois). */
    private readonly criterios = computed<Criterio[]>(() => {
        const usados = new Set(this.todosApontamentos().map((apontamento) => apontamento.criterio));

        return [...new Set([...this.config.criterios(), ...usados])];
    });

    private readonly corrigidas = computed(() =>
        this.base().filter((redacao) => redacao.status === 'em-revisao' || redacao.status === 'devolvida'),
    );

    private readonly todosApontamentos = computed(() => this.corrigidas().flatMap((redacao) => redacao.apontamentos));

    readonly discordanciaGeral = computed(() => discordancia(this.todosApontamentos()));

    readonly decisoesRegistradas = computed(() => this.todosApontamentos().filter((a) => a.decisao).length);

    readonly devolutivas = computed(() => ({
        enviadas: this.base().filter((redacao) => redacao.status === 'devolvida').length,
        total: this.base().length,
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
        this.criterios().map((criterio) => {
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
        const limiar = this.limiar();
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
                        valor - geral >= limiar,
                };
            })
            .sort((a, b) => b.redacoes - a.redacoes);
    });
}
