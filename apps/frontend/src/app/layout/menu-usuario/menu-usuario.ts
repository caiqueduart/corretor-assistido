import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';

import { ROTULO_PERFIL } from '../../core/auth/auth.model';
import { AuthService } from '../../core/auth/auth.service';
import { Icone } from '../../shared/icone/icone';

/** Avatar no topbar que abre o menu da conta. Atlas: ds-user-trigger + ds-menu. */
@Component({
    selector: 'app-menu-usuario',
    imports: [Icone],
    template: `
        @if (auth.usuario(); as usuario) {
            <button
                class="gatilho"
                type="button"
                aria-haspopup="menu"
                aria-controls="menu-conta"
                [attr.aria-expanded]="aberto()"
                (click)="aberto.set(!aberto())"
            >
                <span class="avatar" aria-hidden="true">{{ iniciais() }}</span>
                <span class="gatilho__nome">{{ usuario.nome }}</span>
                <app-icone nome="abaixo" />
                <span class="visualmente-oculto">Menu da conta</span>
            </button>

            @if (aberto()) {
                <div class="menu" id="menu-conta" role="menu" aria-label="Conta">
                    <div class="menu__cabecalho">
                        <span class="menu__nome">{{ usuario.nome }}</span>
                        <span class="menu__email">{{ usuario.email }}</span>
                        <span class="etiqueta etiqueta--caneta">{{ rotuloPerfil[usuario.perfil] }}</span>
                    </div>
                    <button class="menu__item menu__item--perigo" type="button" role="menuitem" (click)="sair()">
                        <app-icone nome="sair" />
                        Sair
                    </button>
                </div>
            }
        }
    `,
    styles: `
        :host {
            position: relative;
            display: inline-flex;
        }

        .gatilho {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            height: var(--control-md);
            padding: 0 var(--space-2) 0 var(--space-1);
            border: 0;
            border-radius: var(--radius-full);
            background: transparent;
            color: var(--text-muted);

            &:hover {
                background: var(--surface-hover);
            }
        }

        .gatilho__nome {
            max-width: 10rem;
            overflow: hidden;
            color: var(--text);
            font-size: var(--text-sm);
            font-weight: var(--weight-medium);
            text-overflow: ellipsis;
            white-space: nowrap;

            @media (width <= 860px) {
                display: none;
            }
        }

        .avatar {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
            background: var(--primary-soft);
            color: var(--primary-soft-text);
            font-size: var(--text-xs);
            font-weight: var(--weight-semibold);
        }

        .menu {
            position: absolute;
            top: calc(100% + 4px);
            right: 0;
            z-index: 50;
            min-width: 15rem;
            padding: var(--space-1);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--surface);
            box-shadow: var(--shadow-md);
        }

        .menu__cabecalho {
            display: grid;
            justify-items: start;
            gap: 2px;
            padding: var(--space-2) var(--space-2) var(--space-3);
            margin-bottom: var(--space-1);
            border-bottom: 1px solid var(--border);
        }

        .menu__nome {
            font-weight: var(--weight-medium);
        }

        .menu__email {
            margin-bottom: var(--space-1);
            color: var(--text-subtle);
            font-size: var(--text-xs);
        }

        .menu__item {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            width: 100%;
            height: var(--control-sm);
            padding: 0 var(--space-2);
            border: 0;
            border-radius: var(--radius-sm);
            background: transparent;
            text-align: left;

            &:hover {
                background: var(--surface-hover);
            }
        }

        .menu__item--perigo {
            color: var(--danger-text);
        }
    `,
    host: {
        '(document:click)': 'cliqueFora($event)',
        '(document:keydown.escape)': 'aberto.set(false)',
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuUsuario {
    protected readonly auth = inject(AuthService);
    private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

    protected readonly aberto = signal(false);
    protected readonly rotuloPerfil = ROTULO_PERFIL;

    /** Iniciais do nome para o avatar (ex.: "Ana Admin" → "AA"). */
    protected readonly iniciais = computed(() => {
        const partes = (this.auth.usuario()?.nome ?? '').trim().split(/\s+/).filter(Boolean);

        return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
    });

    protected cliqueFora(evento: MouseEvent): void {
        if (this.aberto() && !this.elemento.nativeElement.contains(evento.target as Node)) {
            this.aberto.set(false);
        }
    }

    protected sair(): void {
        this.aberto.set(false);
        void this.auth.logout();
    }
}
