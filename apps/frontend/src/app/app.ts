import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ROTULO_PERFIL } from './core/auth/auth.model';
import { AuthService } from './core/auth/auth.service';
import { RedacoesService } from './core/redacoes/redacoes.service';
import { Icone, NomeIcone } from './shared/icone/icone';

interface ItemNavegacao {
    readonly rota: string;
    readonly rotulo: string;
    readonly icone: NomeIcone;
}

const NAVEGACAO: readonly ItemNavegacao[] = [
    { rota: '/redacoes', rotulo: 'Redações', icone: 'redacoes' },
    { rota: '/alunos', rotulo: 'Alunos', icone: 'alunos' },
];

const ITEM_ADMIN: ItemNavegacao = { rota: '/admin', rotulo: 'Administração', icone: 'escudo' };

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

    protected readonly rotuloPerfil = ROTULO_PERFIL;

    protected readonly navegacao = computed(() =>
        this.auth.temPerfil('admin') ? [...NAVEGACAO, ITEM_ADMIN] : NAVEGACAO,
    );

    /** Só a troca de usuário importa (não, por exemplo, a mudança do nome). */
    private readonly idUsuario = computed(() => this.auth.usuario()?.id ?? null);

    constructor() {
        // As redações exigem login: carrega ao entrar e esquece ao sair.
        effect(() => {
            const id = this.idUsuario();

            untracked(() => {
                this.redacoes.limpar();

                if (id) {
                    void this.redacoes.carregar();
                }
            });
        });
    }

    protected sair(): void {
        void this.auth.logout();
    }
}
