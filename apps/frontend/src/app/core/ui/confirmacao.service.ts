import { Injectable, signal } from '@angular/core';

export interface PedidoConfirmacao {
    readonly titulo: string;
    readonly texto: string;
    readonly confirmar: string;
    readonly cancelar?: string;
    /** Ação destrutiva ou sem volta: botão vermelho. */
    readonly perigo?: boolean;
}

interface Pendente extends PedidoConfirmacao {
    readonly responder: (sim: boolean) => void;
}

/**
 * Confirmação antes de ações sem volta, num diálogo do próprio app (no lugar
 * do `confirm()` do navegador). Atlas: ds-modal--centered.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmacaoService {
    private readonly atual = signal<Pendente | null>(null);

    readonly pedido = this.atual.asReadonly();

    confirmar(pedido: PedidoConfirmacao): Promise<boolean> {
        // Um pedido em aberto é respondido como "não" antes de abrir outro.
        this.atual()?.responder(false);

        return new Promise((resolver) => {
            this.atual.set({
                ...pedido,
                responder: (sim) => {
                    this.atual.set(null);
                    resolver(sim);
                },
            });
        });
    }

    responder(sim: boolean): void {
        this.atual()?.responder(sim);
    }
}
