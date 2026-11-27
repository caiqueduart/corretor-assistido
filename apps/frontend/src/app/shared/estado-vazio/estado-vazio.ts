import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icone, NomeIcone } from '../icone/icone';

/** Quando não há o que mostrar: explica o porquê e oferece o próximo passo. Atlas: ds-empty. */
@Component({
    selector: 'app-estado-vazio',
    imports: [Icone],
    template: `
        <span class="vazio__icone" aria-hidden="true"><app-icone [nome]="icone()" /></span>
        <p class="vazio__titulo">{{ titulo() }}</p>
        @if (texto()) {
            <p class="vazio__texto">{{ texto() }}</p>
        }
        <div class="vazio__acao"><ng-content /></div>
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-8) var(--space-6);
            text-align: center;
        }

        .vazio__icone {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 3rem;
            height: 3rem;
            margin-bottom: var(--space-1);
            border-radius: var(--radius-xl);
            background: var(--primary-soft);
            color: var(--primary);
            font-size: 1.25rem;
        }

        .vazio__titulo {
            font-size: var(--text-md);
            font-weight: var(--weight-semibold);
        }

        .vazio__texto {
            max-width: 26rem;
            color: var(--text-muted);
        }

        .vazio__acao {
            margin-top: var(--space-2);

            &:empty {
                display: none;
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoVazio {
    readonly icone = input<NomeIcone>('redacoes');
    readonly titulo = input.required<string>();
    readonly texto = input<string>();
}
