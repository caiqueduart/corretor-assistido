import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AlunosService } from '../../../core/redacoes/alunos.service';
import { compararVersoes, desviosPor100Palavras } from '../../../core/redacoes/analise';
import { textoFinal } from '../../../core/redacoes/redacao.model';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { Icone } from '../../../shared/icone/icone';
import { SituacaoVersao } from '../situacao-versao/situacao-versao';

@Component({
    selector: 'app-aluno-page',
    imports: [RouterLink, DecimalPipe, Icone, SituacaoVersao],
    templateUrl: './aluno-page.html',
    styleUrl: './aluno-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlunoPage {
    protected readonly redacoes = inject(RedacoesService);
    private readonly alunos = inject(AlunosService);

    /** Vem do parâmetro `:codigo` da rota. */
    readonly codigo = input.required<string>();

    protected readonly aluno = computed(() => this.alunos.alunos().find((aluno) => aluno.codigo === this.codigo()));

    /** Versões devolvidas, com a taxa de desvios validados de cada uma. */
    protected readonly pontos = computed(() =>
        (this.aluno()?.versoes ?? [])
            .filter((redacao) => redacao.status === 'devolvida')
            .map((redacao) => ({ redacao, taxa: desviosPor100Palavras(redacao) })),
    );

    protected readonly maiorTaxa = computed(() => Math.max(1, ...this.pontos().map((ponto) => ponto.taxa)));

    /** O que aconteceu, na reescrita, com cada desvio validado na versão anterior. */
    protected readonly comparacao = computed(() => {
        const pontos = this.pontos();

        if (pontos.length < 2) {
            return null;
        }

        const situacoes = compararVersoes(pontos.at(-2)!.redacao, pontos.at(-1)!.redacao);

        return {
            resolvidos: situacoes.filter((situacao) => !situacao.persistiu),
            persistiram: situacoes.filter((situacao) => situacao.persistiu),
        };
    });

    protected readonly textoFinal = textoFinal;
}
