import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';

import { ConfirmacaoService } from '../../core/ui/confirmacao.service';
import { Icone } from '../../shared/icone/icone';

/** Diálogo de confirmação do app. Esc ou "Cancelar" respondem "não". Atlas: ds-modal--centered. */
@Component({
    selector: 'app-confirmacao',
    imports: [Icone],
    template: `
        <dialog
            #dialogo
            class="dialogo confirmacao"
            aria-labelledby="confirmacao-titulo"
            aria-describedby="confirmacao-texto"
            (cancel)="$event.preventDefault(); servico.responder(false)"
        >
            @if (servico.pedido(); as pedido) {
                <div class="confirmacao__centro">
                    <span class="confirmacao__selo" [class.confirmacao__selo--perigo]="pedido.perigo">
                        <app-icone nome="alerta" />
                    </span>
                    <h2 class="confirmacao__titulo" id="confirmacao-titulo">{{ pedido.titulo }}</h2>
                    <p class="confirmacao__texto" id="confirmacao-texto">{{ pedido.texto }}</p>
                </div>
                <div class="confirmacao__acoes">
                    <button class="botao" type="button" (click)="servico.responder(false)" autofocus>
                        {{ pedido.cancelar ?? 'Cancelar' }}
                    </button>
                    <button
                        class="botao"
                        type="button"
                        [class.botao--primario]="!pedido.perigo"
                        [class.botao--destrutivo]="pedido.perigo"
                        (click)="servico.responder(true)"
                    >
                        {{ pedido.confirmar }}
                    </button>
                </div>
            }
        </dialog>
    `,
    styles: `
        .confirmacao {
            width: min(100% - 2rem, 25rem);
            text-align: center;
        }

        .confirmacao__centro {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-8) var(--space-6) var(--space-5);
        }

        .confirmacao__selo {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 3.5rem;
            height: 3.5rem;
            margin-bottom: var(--space-2);
            border-radius: 50%;
            background: var(--warning-soft);
            color: var(--warning);
            font-size: 1.5rem;
            box-shadow: 0 0 0 8px color-mix(in srgb, var(--warning) 8%, transparent);
        }

        .confirmacao__selo--perigo {
            background: var(--danger-soft);
            color: var(--danger-text);
            box-shadow: 0 0 0 8px color-mix(in srgb, var(--danger) 8%, transparent);
        }

        .confirmacao__titulo {
            font-size: var(--text-lg);
            font-weight: var(--weight-semibold);
        }

        .confirmacao__texto {
            max-width: 20rem;
            color: var(--text-muted);
        }

        .confirmacao__acoes {
            display: flex;
            gap: var(--space-3);
            padding: 0 var(--space-6) var(--space-6);

            > * {
                flex: 1;
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Confirmacao {
    protected readonly servico = inject(ConfirmacaoService);
    private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

    constructor() {
        effect(() => {
            const dialogo = this.dialogo().nativeElement;

            if (this.servico.pedido() && !dialogo.open) {
                dialogo.showModal();
            } else if (!this.servico.pedido() && dialogo.open) {
                dialogo.close();
            }
        });
    }
}
