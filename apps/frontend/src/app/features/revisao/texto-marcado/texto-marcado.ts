import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { segmentar } from '../../../core/redacoes/analise';
import { Apontamento, textoFinal } from '../../../core/redacoes/redacao.model';

const ROTULO_DECISAO = {
    aceita: 'aceito por você',
    ajustada: 'ajustado por você',
    recusada: 'recusado por você',
} as const;

/**
 * Texto do aluno com os apontamentos no lugar.
 * A lápis (grafite) o que a IA sugeriu; a caneta o que o professor validou; riscado em vermelho o que recusou.
 */
@Component({
    selector: 'app-texto-marcado',
    templateUrl: './texto-marcado.html',
    styleUrl: './texto-marcado.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextoMarcado {
    readonly conteudo = input.required<string>();
    readonly apontamentos = input.required<readonly Apontamento[]>();
    readonly selecionadoId = input<string | null>(null);
    /** Na devolutiva só aparecem as correções validadas, sem marcas interativas. */
    readonly somenteValidados = input(false);

    readonly selecionar = output<string>();

    protected readonly trechos = computed(() => segmentar(this.conteudo(), this.apontamentos()));

    protected readonly textoFinal = textoFinal;

    protected rotulo(apontamento: Apontamento, indice: number): string {
        const situacao = apontamento.decisao ? ROTULO_DECISAO[apontamento.decisao] : 'sugestão da IA, a decidir';

        return `Apontamento ${indice + 1}: “${apontamento.trecho}” para “${textoFinal(apontamento)}”, ${situacao}`;
    }
}
