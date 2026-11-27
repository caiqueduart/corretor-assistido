import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Blocos cinza animados no lugar do conteúdo que ainda está carregando
 * (Atlas: ds-skeleton). Anuncia "Carregando" a leitores de tela.
 */
@Component({
    selector: 'app-esqueleto',
    template: `
        <span class="visualmente-oculto">{{ rotulo() }}</span>
        @for (linha of linhas(); track $index) {
            <span class="linha" aria-hidden="true" [style.width.%]="linha"></span>
        }
    `,
    styles: `
        :host {
            display: grid;
            gap: var(--space-3);
        }

        .linha {
            display: block;
            height: 0.875rem;
            border-radius: var(--radius-sm);
            background: linear-gradient(
                    90deg,
                    var(--surface-muted) 25%,
                    color-mix(in srgb, var(--border) 70%, var(--surface-muted)) 50%,
                    var(--surface-muted) 75%
                )
                0 0 / 200% 100%;
            animation: brilho 1.4s linear infinite;

            &:first-of-type {
                height: 1.25rem;
            }
        }

        @keyframes brilho {
            to {
                background-position: -200% 0;
            }
        }
    `,
    host: { role: 'status' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Esqueleto {
    /** Quantidade de linhas simuladas. */
    readonly quantidade = input(4);
    readonly rotulo = input('Carregando…');

    /** Larguras variadas para parecer texto de verdade. */
    protected readonly linhas = computed(() =>
        Array.from({ length: this.quantidade() }, (_, i) => (i === 0 ? 40 : [100, 92, 76, 85][i % 4])),
    );
}
