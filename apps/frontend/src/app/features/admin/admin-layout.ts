import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface Aba {
    readonly rota: string;
    readonly rotulo: string;
}

const ABAS: readonly Aba[] = [
    { rota: 'usuarios', rotulo: 'Usuários' },
    { rota: 'configuracao', rotulo: 'Configuração' },
    { rota: 'auditoria', rotulo: 'Auditoria' },
    { rota: 'metricas', rotulo: 'Métricas' },
];

/** Abas da área de administração (só perfil admin). */
@Component({
    selector: 'app-admin-layout',
    imports: [RouterOutlet, RouterLink, RouterLinkActive],
    template: `
        <nav class="abas" aria-label="Administração">
            @for (aba of abas; track aba.rota) {
                <a
                    class="abas__item"
                    [routerLink]="aba.rota"
                    routerLinkActive="abas__item--ativa"
                    ariaCurrentWhenActive="page"
                >
                    {{ aba.rotulo }}
                </a>
            }
        </nav>

        <router-outlet />
    `,
    styles: `
        /* Atlas: ds-tabs (sublinhado). */
        :host {
            display: block;
        }

        .abas {
            display: flex;
            gap: var(--space-1);
            margin-bottom: var(--space-6);
            overflow-x: auto;
            box-shadow: inset 0 -1px 0 var(--border);
            scrollbar-width: none;
        }

        .abas__item {
            position: relative;
            display: inline-flex;
            align-items: center;
            height: var(--control-md);
            padding: 0 var(--space-3);
            color: var(--text-muted);
            font-weight: var(--weight-medium);
            text-decoration: none;
            white-space: nowrap;
            transition: color var(--duration-fast) var(--ease);

            &:hover {
                color: var(--text);
            }
        }

        .abas__item--ativa {
            color: var(--text);

            &::after {
                content: '';
                position: absolute;
                right: var(--space-3);
                bottom: 0;
                left: var(--space-3);
                height: 2px;
                border-radius: 2px;
                background: var(--primary);
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
    protected readonly abas = ABAS;
}
