import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const ICONES = {
    aceitar: ['M20 6 9 17l-5-5'],
    recusar: ['M18 6 6 18', 'M6 6l12 12'],
    ajustar: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
    lapis: ['M3 21l1.5-4.5L16 5l3 3L7.5 19.5Z', 'M14 7l3 3'],
    voltar: ['M19 12H5', 'M12 19l-7-7 7-7'],
    anterior: ['M15 18l-6-6 6-6'],
    proximo: ['M9 18l6-6-6-6'],
    importar: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    enviar: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4Z'],
    olho: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    alerta: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z', 'M12 9v4', 'M12 17h.01'],
    redacoes: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
    alunos: [
        'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
        'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
        'M22 21v-2a4 4 0 0 0-3-3.9',
        'M16 3.1a4 4 0 0 1 0 7.8',
    ],
    metricas: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
    selo: ['M12 2 15 5h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4Z', 'M8.5 12l2.5 2.5 4.5-5'],
    desfazer: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
} as const;

export type NomeIcone = keyof typeof ICONES;

/** Ícones de traço único desenhados para o corretor. Decorativos por padrão. */
@Component({
    selector: 'app-icone',
    template: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            @for (caminho of caminhos(); track $index) {
                <path [attr.d]="caminho" />
            }
        </svg>
    `,
    styles: `
        :host {
            display: inline-flex;
            flex: none;
            width: 1.125em;
            height: 1.125em;
        }

        svg {
            width: 100%;
            height: 100%;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icone {
    readonly nome = input.required<NomeIcone>();

    protected readonly caminhos = computed(() => ICONES[this.nome()]);
}
