import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Perfil, Usuario, UsuarioApi, deUsuarioApi } from './auth.model';
import { SessaoService } from './sessao.service';

interface RespostaLogin {
    readonly token: string;
    readonly expira_em: string;
    readonly usuario: UsuarioApi;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly http = inject(HttpClient);
    private readonly router = inject(Router);
    private readonly sessao = inject(SessaoService);

    private readonly _usuario = signal<Usuario | null>(null);
    private restauracao: Promise<void> | null = null;

    readonly usuario = this._usuario.asReadonly();
    readonly logado = computed(() => this._usuario() !== null);
    readonly perfil = computed<Perfil | null>(() => this._usuario()?.perfil ?? null);

    temPerfil(...perfis: Perfil[]): boolean {
        const atual = this.perfil();

        return atual !== null && perfis.includes(atual);
    }

    async login(email: string, senha: string): Promise<Usuario> {
        const resposta = await firstValueFrom(this.http.post<RespostaLogin>('/api/auth/login', { email, senha }));
        const usuario = deUsuarioApi(resposta.usuario);

        this.sessao.guardar(resposta.token, resposta.expira_em);
        this._usuario.set(usuario);
        this.restauracao = Promise.resolve();

        return usuario;
    }

    /**
     * Recupera o usuário a partir do token guardado. Roda uma vez por carga da
     * página; as chamadas seguintes reaproveitam o resultado.
     */
    restaurar(): Promise<void> {
        this.restauracao ??= this.buscarUsuarioAtual();

        return this.restauracao;
    }

    /** Reflete na barra uma alteração feita pelo próprio usuário (ex.: nome). */
    atualizarUsuarioAtual(usuario: Usuario): void {
        if (this._usuario()?.id === usuario.id) {
            this._usuario.set(usuario);
        }
    }

    async logout(): Promise<void> {
        if (this.sessao.token()) {
            try {
                await firstValueFrom(this.http.post('/api/auth/logout', null));
            } catch {
                // A sessão pode já ter expirado no servidor; sair localmente basta.
            }
        }

        this.encerrar();
        await this.router.navigate(['/login']);
    }

    /** Chamado quando a API responde 401: limpa a sessão e volta ao login. */
    sessaoExpirada(): void {
        if (!this.logado() && !this.sessao.token()) {
            return;
        }

        const voltar = this.router.url;
        this.encerrar();
        void this.router.navigate(['/login'], {
            queryParams: { expirada: 1, voltar: voltar.startsWith('/login') ? null : voltar },
        });
    }

    private encerrar(): void {
        this.sessao.limpar();
        this._usuario.set(null);
        this.restauracao = Promise.resolve();
    }

    private async buscarUsuarioAtual(): Promise<void> {
        if (!this.sessao.token()) {
            return;
        }

        try {
            const usuario = await firstValueFrom(this.http.get<UsuarioApi>('/api/me'));
            this._usuario.set(deUsuarioApi(usuario));
        } catch {
            // Token inválido ou servidor fora do ar: segue deslogado.
            this.sessao.limpar();
            this._usuario.set(null);
        }
    }
}
