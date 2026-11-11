import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { apontamentosDaDevolutiva } from '../../../core/redacoes/analise';
import { Redacao, textoFinal } from '../../../core/redacoes/redacao.model';
import { TextoMarcado } from '../texto-marcado/texto-marcado';

/** O que o aluno recebe: só as correções validadas e o recado do professor. */
@Component({
    selector: 'app-devolutiva',
    imports: [TextoMarcado],
    templateUrl: './devolutiva.html',
    styleUrl: './devolutiva.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Devolutiva {
    readonly redacao = input.required<Redacao>();

    protected readonly validados = computed(() => apontamentosDaDevolutiva(this.redacao()));
    protected readonly ocultos = computed(() => this.redacao().apontamentos.length - this.validados().length);

    protected readonly textoFinal = textoFinal;
}
