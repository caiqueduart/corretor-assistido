import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ConfigService } from '../../core/admin/config.service';
import { AuthService } from '../../core/auth/auth.service';
import { TrilhaService } from '../../core/navegacao/trilha.service';
import { Icone } from '../../shared/icone/icone';
import { BuscaRapida } from '../busca-rapida/busca-rapida';
import { MenuUsuario } from '../menu-usuario/menu-usuario';

/**
 * Barra do topo: onde o usuário está (trilha), busca rápida, ações frequentes e
 * menu da conta. Atlas: topbar + ds-breadcrumbs.
 */
@Component({
    selector: 'app-topbar',
    imports: [RouterLink, Icone, BuscaRapida, MenuUsuario],
    templateUrl: './topbar.html',
    styleUrl: './topbar.scss',
    host: { class: 'topbar' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
    private readonly auth = inject(AuthService);
    private readonly config = inject(ConfigService);
    protected readonly trilha = inject(TrilhaService);

    /** Abre o menu lateral no celular. */
    readonly abrirMenu = output<void>();

    protected readonly professor = computed(() => this.auth.temPerfil('professor'));
    protected readonly admin = computed(() => this.auth.temPerfil('admin'));
    protected readonly ia = this.config.iaConfigurada;
}
