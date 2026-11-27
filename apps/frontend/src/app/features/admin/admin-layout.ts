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
        :host {
            display: block;
        }

        .abas {
            display: flex;
            gap: 0.25rem;
            margin-bottom: 1.5rem;
            overflow-x: auto;
            border-bottom: 1px solid var(--linha);
        }

        .abas__item {
            margin-bottom: -1px;
            padding: 0.625rem 0.875rem;
            border-bottom: 2px solid transparent;
            color: var(--texto-2);
            font-size: 0.9375rem;
            font-weight: 600;
            text-decoration: none;
            white-space: nowrap;

            &:hover {
                color: var(--texto);
            }
        }

        .abas__item--ativa {
            border-bottom-color: var(--caneta);
            color: var(--caneta-forte);
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
    protected readonly abas = ABAS;
}
