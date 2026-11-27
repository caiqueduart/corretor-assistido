import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ConfigService } from './core/admin/config.service';
import { PropostasService } from './core/propostas/propostas.service';
import { AuthService } from './core/auth/auth.service';
import { RedacoesService } from './core/redacoes/redacoes.service';
import { Avisos } from './layout/avisos/avisos';
import { Confirmacao } from './layout/confirmacao/confirmacao';
import { Topbar } from './layout/topbar/topbar';
import { Icone, NomeIcone } from './shared/icone/icone';
import { CodigosService } from './core/alunos/codigos.service';

interface ItemNavegacao {
    readonly rota: string;
    readonly rotulo: string;
    readonly icone: NomeIcone;
}

interface SecaoNavegacao {
    readonly titulo: string;
    readonly itens: readonly ItemNavegacao[];
}

const INICIO: ItemNavegacao = { rota: '/inicio', rotulo: 'Início', icone: 'inicio' };

/** O professor corrige; o admin só administra. */
const PROFESSOR: SecaoNavegacao = {
    titulo: 'Principal',
    itens: [
        INICIO,
        { rota: '/propostas', rotulo: 'Propostas', icone: 'proposta' },
        { rota: '/redacoes', rotulo: 'Redações', icone: 'redacoes' },
        { rota: '/alunos', rotulo: 'Alunos', icone: 'alunos' },
    ],
};

const ADMIN: SecaoNavegacao = { titulo: 'Principal', itens: [INICIO] };

const SISTEMA: SecaoNavegacao = {
    titulo: 'Sistema',
    itens: [{ rota: '/admin', rotulo: 'Administração', icone: 'escudo' }],
};

const CHAVE_MENU = 'corretor.menu-recolhido';

/** "/aluno" (área do aluno), mas não "/alunos" (tela dos professores). */
export function ehAreaDoAluno(url: string): boolean {
    return /^\/aluno(?:[/?#]|$)/.test(url);
}

function lerPreferenciaMenu(): boolean {
    try {
        return localStorage.getItem(CHAVE_MENU) === '1';
    } catch {
        return false;
    }
}

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
    private readonly propostas = inject(PropostasService);
    private readonly codigos = inject(CodigosService);

    /** Menu lateral aberto no celular (no desktop ele fica sempre visível). */
    protected readonly menuAberto = signal(false);

    /** A área do aluno é uma página à parte: nunca aparece dentro do menu dos professores. */
    protected readonly areaDoAluno = signal(false);

    /** No desktop, menu recolhido mostra só os ícones. A preferência fica salva no navegador. */
    protected readonly recolhido = signal(lerPreferenciaMenu());

    protected readonly secoes = computed(() => (this.auth.temPerfil('admin') ? [ADMIN, SISTEMA] : [PROFESSOR]));

    /** Só a troca de usuário importa (não, por exemplo, a mudança do nome). */
    private readonly idUsuario = computed(() => this.auth.usuario()?.id ?? null);

    constructor() {
        // Redações e configuração exigem login: carrega ao entrar e esquece ao sair.
        effect(() => {
            const id = this.idUsuario();

            untracked(() => {
                this.redacoes.limpar();
                this.config.limpar();
                this.propostas.limpar();
                this.codigos.limpar();

                if (id) {
                    void this.redacoes.carregar();
                    void this.config.carregar();
                    void this.propostas.carregar();
                }
            });
        });

        // No celular, fecha o menu ao navegar.
        inject(Router)
            .events.pipe(
                filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
                takeUntilDestroyed(),
            )
            .subscribe((evento) => {
                this.areaDoAluno.set(ehAreaDoAluno(evento.urlAfterRedirects));
                this.menuAberto.set(false);
                this.focarConteudo();
            });
    }

    protected alternarRecolhido(): void {
        const recolher = !this.recolhido();
        this.recolhido.set(recolher);

        try {
            localStorage.setItem(CHAVE_MENU, recolher ? '1' : '0');
        } catch {
            // Sem armazenamento: vale só nesta aba.
        }
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
