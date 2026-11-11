import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    afterRenderEffect,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';

import { Apontamento, Decisao, textoFinal } from '../../../core/redacoes/redacao.model';
import { Icone } from '../../../shared/icone/icone';

export interface EventoDecisao {
    readonly decisao: Decisao | null;
    readonly textoProfessor?: string;
}

const SITUACAO = {
    aceita: 'Aceito',
    ajustada: 'Ajustado',
    recusada: 'Recusado',
} as const;

/** Um apontamento da IA e as três decisões possíveis do professor. */
@Component({
    selector: 'app-apontamento-item',
    imports: [Icone],
    templateUrl: './apontamento-item.html',
    styleUrl: './apontamento-item.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.selecionado]': 'selecionado()',
        '[class]': "'decisao-' + (apontamento().decisao ?? 'pendente')",
    },
})
export class ApontamentoItem {
    readonly apontamento = input.required<Apontamento>();
    readonly numero = input.required<number>();
    readonly selecionado = input(false);
    readonly bloqueado = input(false);

    readonly selecionar = output<void>();
    readonly decidir = output<EventoDecisao>();

    protected readonly ajustando = signal(false);
    private readonly campoAjuste = viewChild<ElementRef<HTMLInputElement>>('campoAjuste');

    protected readonly textoFinal = textoFinal;
    protected readonly situacao = SITUACAO;

    constructor() {
        afterRenderEffect(() => {
            this.campoAjuste()?.nativeElement.focus();
        });
    }

    /** Clicar de novo na decisão já escolhida desfaz. */
    protected alternar(decisao: Exclude<Decisao, 'ajustada'>): void {
        this.ajustando.set(false);
        this.decidir.emit({ decisao: this.apontamento().decisao === decisao ? null : decisao });
    }

    abrirAjuste(): void {
        this.selecionar.emit();
        this.ajustando.set(true);
    }

    protected salvarAjuste(valor: string): void {
        const texto = valor.trim();

        if (!texto) {
            return;
        }

        this.ajustando.set(false);
        this.decidir.emit(
            texto === this.apontamento().sugestaoIa
                ? { decisao: 'aceita' }
                : { decisao: 'ajustada', textoProfessor: texto },
        );
    }

    protected cancelarAjuste(): void {
        this.ajustando.set(false);
    }
}
