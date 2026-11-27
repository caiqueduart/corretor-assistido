import { DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnInit,
    computed,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';

import { UsuariosService } from '../../../core/admin/usuarios.service';
import { mensagemDeErro } from '../../../core/api/erro-api';
import { PERFIS, Perfil, ROTULO_PERFIL, Usuario } from '../../../core/auth/auth.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Icone } from '../../../shared/icone/icone';
import { UsuarioFormulario, UsuarioSalvo } from './usuario-formulario';

type Edicao = { readonly usuario: Usuario | null };

interface Confirmacao {
    readonly mensagem: string;
    readonly senha: string | null;
}

@Component({
    selector: 'app-usuarios-page',
    imports: [DatePipe, CabecalhoPagina, Icone, UsuarioFormulario],
    templateUrl: './usuarios-page.html',
    styleUrl: './usuarios-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuariosPage implements OnInit {
    private readonly usuariosApi = inject(UsuariosService);
    private readonly auth = inject(AuthService);

    protected readonly perfis = PERFIS;
    protected readonly rotuloPerfil = ROTULO_PERFIL;

    protected readonly usuarios = signal<Usuario[]>([]);
    protected readonly carregando = signal(true);
    protected readonly erro = signal<string | null>(null);
    protected readonly confirmacao = signal<Confirmacao | null>(null);
    protected readonly senhaCopiada = signal(false);

    protected readonly busca = signal('');
    protected readonly filtroPerfil = signal<Perfil | ''>('');

    /** Usuário em edição; `{ usuario: null }` é a criação. */
    protected readonly edicao = signal<Edicao | null>(null);

    private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');

    protected readonly idAtual = computed(() => this.auth.usuario()?.id ?? null);

    protected readonly filtrados = computed(() => {
        const termo = normalizar(this.busca());
        const perfil = this.filtroPerfil();

        return this.usuarios().filter(
            (u) =>
                (!perfil || u.perfil === perfil) &&
                (!termo || normalizar(u.nome).includes(termo) || normalizar(u.email).includes(termo)),
        );
    });

    protected readonly resumo = computed(() => {
        const todos = this.usuarios();

        return { total: todos.length, ativos: todos.filter((u) => u.ativo).length };
    });

    constructor() {
        // Abre e fecha o <dialog> nativo junto com o estado de edição.
        effect(() => {
            const dialogo = this.dialogo()?.nativeElement;

            if (!dialogo) {
                return;
            }

            if (this.edicao() && !dialogo.open) {
                dialogo.showModal();
            } else if (!this.edicao() && dialogo.open) {
                dialogo.close();
            }
        });
    }

    ngOnInit(): void {
        void this.carregar();
    }

    protected async carregar(): Promise<void> {
        this.carregando.set(true);
        this.erro.set(null);

        try {
            this.usuarios.set(await this.usuariosApi.listar());
        } catch (erro) {
            this.erro.set(mensagemDeErro(erro, 'Não foi possível carregar os usuários.'));
        } finally {
            this.carregando.set(false);
        }
    }

    protected abrir(usuario: Usuario | null): void {
        this.confirmacao.set(null);
        this.edicao.set({ usuario });
    }

    protected fechar(): void {
        this.edicao.set(null);
    }

    protected aoSalvar({ usuario, novo, senha }: UsuarioSalvo): void {
        this.usuarios.update((lista) =>
            (novo ? [...lista, usuario] : lista.map((u) => (u.id === usuario.id ? usuario : u))).sort((a, b) =>
                a.nome.localeCompare(b.nome, 'pt-BR'),
            ),
        );
        this.auth.atualizarUsuarioAtual(usuario);
        this.edicao.set(null);
        this.senhaCopiada.set(false);
        this.confirmacao.set({
            mensagem: novo
                ? `${usuario.nome} foi cadastrado como ${ROTULO_PERFIL[usuario.perfil].toLowerCase()}.`
                : `Alterações de ${usuario.nome} salvas.`,
            senha,
        });
    }

    protected async copiarSenha(senha: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(senha);
            this.senhaCopiada.set(true);
        } catch {
            this.senhaCopiada.set(false);
        }
    }

    protected filtrarPerfil(evento: Event): void {
        this.filtroPerfil.set((evento.target as HTMLSelectElement).value as Perfil | '');
    }

    protected buscar(evento: Event): void {
        this.busca.set((evento.target as HTMLInputElement).value);
    }
}

function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}
