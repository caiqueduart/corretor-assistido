import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { Perfil, Usuario, UsuarioApi, deUsuarioApi } from '../auth/auth.model';

/** Mesmo mínimo do back-end (`auth.TamanhoMinimoSenha`). */
export const TAMANHO_MINIMO_SENHA = 10;

export interface NovoUsuario {
    readonly nome: string;
    readonly email: string;
    readonly perfil: Perfil;
    readonly senha: string;
}

/** Só os campos presentes são alterados. Trocar a senha encerra as sessões do usuário. */
export interface AlteracaoUsuario {
    readonly nome?: string;
    readonly perfil?: Perfil;
    readonly ativo?: boolean;
    readonly senha?: string;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
    private readonly http = inject(HttpClient);

    listar(): Promise<Usuario[]> {
        return firstValueFrom(
            this.http
                .get<{ usuarios: UsuarioApi[] }>('/api/usuarios')
                .pipe(map((resposta) => resposta.usuarios.map(deUsuarioApi))),
        );
    }

    criar(novo: NovoUsuario): Promise<Usuario> {
        return firstValueFrom(this.http.post<UsuarioApi>('/api/usuarios', novo).pipe(map(deUsuarioApi)));
    }

    alterar(id: string, alteracao: AlteracaoUsuario): Promise<Usuario> {
        return firstValueFrom(
            this.http.patch<UsuarioApi>(`/api/usuarios/${encodeURIComponent(id)}`, alteracao).pipe(map(deUsuarioApi)),
        );
    }
}

const ALFABETO_SENHA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Senha aleatória sem caracteres ambíguos (0/O, 1/l/I), fácil de ditar ao usuário. */
export function gerarSenha(tamanho = 14): string {
    const bytes = new Uint32Array(tamanho);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (n) => ALFABETO_SENHA[n % ALFABETO_SENHA.length]).join('');
}
