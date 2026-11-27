import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ConfigService } from './core/admin/config.service';
import { AuthService } from './core/auth/auth.service';
import { RedacoesService } from './core/redacoes/redacoes.service';
import { Avisos } from './layout/avisos/avisos';
import { Confirmacao } from './layout/confirmacao/confirmacao';
import { Topbar } from './layout/topbar/topbar';
import { Icone, NomeIcone } from './shared/icone/icone';

interface ItemNavegacao {
    readonly rota: string;
    readonly rotulo: string;
    readonly icone: NomeIcone;
}

interface SecaoNavegacao {
    readonly titulo: string;
    readonly itens: readonly ItemNavegacao[];
}

const PRINCIPAL: SecaoNavegacao = {
    titulo: 'Principal',
    itens: [
        { rota: '/inicio', rotulo: 'Início', icone: 'inicio' },
        { rota: '/redacoes', rotulo: 'Redações', icone: 'redacoes' },
        { rota: '/alunos', rotulo: 'Alunos', icone: 'alunos' },
    ],
};

const SISTEMA: SecaoNavegacao = {
    titulo: 'Sistema',
    itens: [{ rota: '/admin', rotulo: 'Administração', icone: 'escudo' }],
};

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone, Topbar, Avisos, Confirmacao],
    templateUrl: './app.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
    private primeiraNavegacao = true;

    protected readonly auth = inject(AuthService);
    protected readonly redacoes = inject(RedacoesService);
    private readonly config = inject(ConfigService);

    /** Menu lateral aberto no celular (no desktop ele fica sempre visível). */
    protected readonly menuAberto = signal(false);

    protected readonly secoes = computed(() => (this.auth.temPerfil('admin') ? [PRINCIPAL, SISTEMA] : [PRINCIPAL]));

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

        // No celular, fecha o menu ao navegar.
        inject(Router)
            .events.pipe(
                filter((evento) => evento instanceof NavigationEnd),
                takeUntilDestroyed(),
            )
            .subscribe(() => {
                this.menuAberto.set(false);
                this.focarConteudo();
            });
    }

    /**
     * Ao trocar de página, leva o foco ao conteúdo: o leitor de tela anuncia a
     * página nova e o Tab recomeça dali. Na primeira carga, mantém o foco natural.
     */
    private focarConteudo(): void {
        if (this.primeiraNavegacao) {
            this.primeiraNavegacao = false;
            return;
        }

        setTimeout(() => {
            document.getElementById('conteudo')?.focus({ preventScroll: true });
            window.scrollTo({ top: 0 });
        });
    }
}
