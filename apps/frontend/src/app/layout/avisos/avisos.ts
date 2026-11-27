import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AvisosService, TipoAviso } from '../../core/ui/avisos.service';
import { Icone, NomeIcone } from '../../shared/icone/icone';

const ICONE: Readonly<Record<TipoAviso, NomeIcone>> = { sucesso: 'aceitar', erro: 'alerta', info: 'olho' };

/** Região dos avisos flutuantes, no canto inferior direito. Atlas: ds-toast-region. */
@Component({
    selector: 'app-avisos',
    imports: [Icone],
    template: `
        @for (aviso of avisos.avisos(); track aviso.id) {
            <div
                class="aviso-flutuante"
                [class]="'aviso-flutuante--' + aviso.tipo"
                [attr.role]="aviso.tipo === 'erro' ? 'alert' : 'status'"
            >
                <app-icone class="aviso-flutuante__icone" [nome]="icone[aviso.tipo]" />
                <div class="aviso-flutuante__corpo">
                    <p class="aviso-flutuante__titulo">{{ aviso.titulo }}</p>
                    @if (aviso.texto) {
                        <p class="aviso-flutuante__texto">{{ aviso.texto }}</p>
                    }
                </div>
                <button
                    class="aviso-flutuante__fechar"
                    type="button"
                    aria-label="Fechar aviso"
                    (click)="avisos.fechar(aviso.id)"
                >
                    <app-icone nome="recusar" />
                </button>
                <span class="aviso-flutuante__tempo" aria-hidden="true"></span>
            </div>
        }
    `,
    styles: `
        :host {
            position: fixed;
            right: var(--space-5);
            bottom: var(--space-5);
            z-index: 80;
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            width: 24rem;
            max-width: calc(100vw - 2rem);
            pointer-events: none;
        }

        .aviso-flutuante {
            --tom: #7dd3fc;

            position: relative;
            display: flex;
            align-items: flex-start;
            gap: var(--space-3);
            padding: var(--space-4);
            overflow: hidden;
            border-radius: var(--radius-lg);
            background: #18181b;
            color: #fafafa;
            box-shadow: var(--shadow-lg);
            pointer-events: auto;
            animation: entrar var(--duration-base) var(--ease);
        }

        .aviso-flutuante--sucesso {
            --tom: #4ade80;
        }

        .aviso-flutuante--erro {
            --tom: #ff6b78;
        }

        .aviso-flutuante__icone {
            margin-top: 0.125rem;
            color: var(--tom);
        }

        .aviso-flutuante__corpo {
            flex: 1;
            min-width: 0;
        }

        .aviso-flutuante__titulo {
            font-weight: var(--weight-semibold);
        }

        .aviso-flutuante__texto {
            margin-top: 0.125rem;
            color: #a1a1aa;
            font-size: var(--text-sm);
        }

        .aviso-flutuante__fechar {
            display: inline-flex;
            padding: var(--space-1);
            border: 0;
            border-radius: var(--radius-sm);
            background: transparent;
            color: #a1a1aa;

            &:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
        }

        .aviso-flutuante__tempo {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 3px;
            background: var(--tom);
            transform-origin: left;
            animation: tempo 5s linear forwards;
        }

        @keyframes entrar {
            from {
                opacity: 0;
                transform: translateX(24px);
            }
        }

        @keyframes tempo {
            to {
                transform: scaleX(0);
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avisos {
    protected readonly avisos = inject(AvisosService);
    protected readonly icone = ICONE;
}
