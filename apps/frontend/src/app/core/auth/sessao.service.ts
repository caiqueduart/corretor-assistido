import { Injectable, signal } from '@angular/core';

const CHAVE = 'corretor.sessao';

interface SessaoGuardada {
    readonly token: string;
    readonly expiraEm: string;
}

/**
 * Guarda o token de acesso no `localStorage`, que mantém o login entre abas e
 * reaberturas até a sessão expirar no servidor. Não depende de HttpClient, para
 * que o interceptor possa usá-lo sem dependência circular.
 */
@Injectable({ providedIn: 'root' })
export class SessaoService {
    private readonly sessao = signal<SessaoGuardada | null>(this.ler());

    /** Token válido (não expirado) ou null. */
    token(): string | null {
        const atual = this.sessao();

        if (!atual) {
            return null;
        }

        if (Date.parse(atual.expiraEm) <= Date.now()) {
            this.limpar();
            return null;
        }

        return atual.token;
    }

    guardar(token: string, expiraEm: string): void {
        const sessao = { token, expiraEm };
        this.sessao.set(sessao);

        try {
            localStorage.setItem(CHAVE, JSON.stringify(sessao));
        } catch {
            // Sem armazenamento (modo privado, bloqueio): a sessão vale só nesta aba.
        }
    }

    limpar(): void {
        this.sessao.set(null);

        try {
            localStorage.removeItem(CHAVE);
        } catch {
            // Nada a fazer.
        }
    }

    private ler(): SessaoGuardada | null {
        try {
            const bruto = localStorage.getItem(CHAVE);
            const valor = bruto ? (JSON.parse(bruto) as Partial<SessaoGuardada>) : null;

            return typeof valor?.token === 'string' && typeof valor.expiraEm === 'string'
                ? { token: valor.token, expiraEm: valor.expiraEm }
                : null;
        } catch {
            return null;
        }
    }
}
