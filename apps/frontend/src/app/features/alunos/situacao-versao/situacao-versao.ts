import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Redacao } from '../../../core/redacoes/redacao.model';

const ROTULOS = {
    'aguardando-ia': { texto: 'sem correção', classe: '' },
    corrigindo: { texto: 'IA corrigindo', classe: '' },
    'em-revisao': { texto: 'em revisão', classe: 'etiqueta--marca-texto' },
    devolvida: { texto: 'devolvida', classe: 'etiqueta--caneta' },
} as const;

/** Etiqueta "v1 · devolvida" usada nas listas de alunos. */
@Component({
    selector: 'app-situacao-versao',
    template: `<span class="etiqueta" [class]="rotulo().classe">v{{ redacao().versao }} · {{ rotulo().texto }}</span>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SituacaoVersao {
    readonly redacao = input.required<Redacao>();

    protected readonly rotulo = computed(() => ROTULOS[this.redacao().status]);
}
