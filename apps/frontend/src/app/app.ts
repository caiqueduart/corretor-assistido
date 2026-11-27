import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ConfigService } from './core/admin/config.service';
import { Perfil, ROTULO_PERFIL, rotaInicial } from './core/auth/auth.model';
import { AuthService } from './core/auth/auth.service';
import { RedacoesService } from './core/redacoes/redacoes.service';
import { Icone, NomeIcone } from './shared/icone/icone';

interface ItemNavegacao {
    readonly rota: string;
    readonly rotulo: string;
    readonly icone: NomeIcone;
}

const NAVEGACAO: Readonly<Record<Perfil, readonly ItemNavegacao[]>> = {
    professor: [
        { rota: '/redacoes', rotulo: 'Redações', icone: 'redacoes' },
    ],
    admin: [{ rota: '/admin', rotulo: 'Administração', icone: 'escudo' }],
};

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone],
    templateUrl: './app.html',
    styleUrl: './app.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
    protected readonly auth = inject(AuthService);
    protected readonly redacoes = inject(RedacoesService);
    private readonly config = inject(ConfigService);

    protected readonly rotuloPerfil = ROTULO_PERFIL;

    protected readonly navegacao = computed(() => {
        const perfil = this.auth.perfil();

        return perfil ? NAVEGACAO[perfil] : [];
    });

    protected readonly inicio = computed(() => rotaInicial(this.auth.perfil()));

    /** Só a troca de usuário importa (não, por exemplo, a mudança do nome). */
    private readonly idUsuario = computed(() => this.auth.usuario()?.id ?? null);

    constructor() {
        // Redações e configuração exigem login: carrega ao entrar e esquece ao sair.
        effect(() => {
            const id = this.idUsuario();

            untracked(() => {
                this.redacoes.limpar();
                this.config.limpar();

                if (id) {
                    void this.redacoes.carregar();
                    void this.config.carregar();
                }
            });
        });
    }

    protected sair(): void {
        void this.auth.logout();
    }
}
