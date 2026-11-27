import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'sucesso' | 'erro' | 'info';

export interface Aviso {
    readonly id: number;
    readonly tipo: TipoAviso;
    readonly titulo: string;
    readonly texto?: string;
}

const DURACAO_MS = 5000;

/** Avisos flutuantes (toasts) que confirmam ações e somem sozinhos. Atlas: ds-toast. */
@Injectable({ providedIn: 'root' })
export class AvisosService {
    private proximo = 1;
    private readonly lista = signal<readonly Aviso[]>([]);

    readonly avisos = this.lista.asReadonly();

    mostrar(titulo: string, opcoes: { tipo?: TipoAviso; texto?: string } = {}): void {
        const aviso: Aviso = { id: this.proximo++, tipo: opcoes.tipo ?? 'sucesso', titulo, texto: opcoes.texto };

        // No máximo 3 na tela: o mais antigo sai.
        this.lista.update((atual) => [...atual.slice(-2), aviso]);
        setTimeout(() => this.fechar(aviso.id), DURACAO_MS);
    }

    fechar(id: number): void {
        this.lista.update((atual) => atual.filter((aviso) => aviso.id !== id));
    }
}
