import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';

const PREFIXO = 'corretor.chamada.';

type Lista = Readonly<Record<string, string>>;

/**
 * Lista de chamada local: liga o identificador do aluno no sistema (apelido ou
 * código) ao nome real. Fica SÓ no navegador deste computador, separada por
 * usuário; nunca vai para o servidor, para a IA, para as métricas nem para o CSV.
 */
@Injectable({ providedIn: 'root' })
export class ChamadaService {
    private readonly auth = inject(AuthService);
    private readonly lista = signal<Lista>({});
    private readonly chave = computed(() => {
        const id = this.auth.usuario()?.id;

        return id ? PREFIXO + id : null;
    });

    /** Quantos alunos têm nome neste computador. */
    readonly total = computed(() => Object.keys(this.lista()).length);

    constructor() {
        // Cada usuário tem a sua lista; troca ao entrar e sair.
        effect(() => this.lista.set(ler(this.chave())));
    }

    nome(identificador: string): string | null {
        return this.lista()[identificador] ?? null;
    }

    /** "Maria Souza (Ipê Lilás)" quando há nome neste computador; senão, só o identificador. */
    rotulo(identificador: string): string {
        const nome = this.nome(identificador);

        return nome ? `${nome} (${identificador})` : identificador;
    }

    definir(identificador: string, nome: string): void {
        const limpo = nome.trim();
        const { [identificador]: _, ...resto } = this.lista();

        this.salvar(limpo ? { ...resto, [identificador]: limpo } : resto);
    }

    /** Cópia de segurança para levar a lista a outro computador. */
    exportar(): string {
        return JSON.stringify({ tipo: 'corretor-chamada', versao: 1, alunos: this.lista() }, null, 2);
    }

    /** Junta uma cópia exportada à lista atual. Devolve quantos nomes entraram. */
    importar(conteudo: string): number {
        const dados = JSON.parse(conteudo) as { tipo?: string; alunos?: Record<string, unknown> };

        if (dados.tipo !== 'corretor-chamada' || typeof dados.alunos !== 'object' || !dados.alunos) {
            throw new Error('Este arquivo não é uma lista de chamada do corretor.');
        }

        const validos = Object.entries(dados.alunos).filter(
            (par): par is [string, string] => typeof par[1] === 'string' && !!par[1].trim(),
        );
        this.salvar({ ...this.lista(), ...Object.fromEntries(validos) });

        return validos.length;
    }

    /** Apaga os nomes deste computador (ex.: computador compartilhado). */
    esquecer(): void {
        this.salvar({});
    }

    private salvar(lista: Lista): void {
        this.lista.set(lista);
        const chave = this.chave();

        if (!chave) {
            return;
        }

        try {
            if (Object.keys(lista).length) {
                localStorage.setItem(chave, JSON.stringify(lista));
            } else {
                localStorage.removeItem(chave);
            }
        } catch {
            // Sem armazenamento (modo privado): a lista vale só nesta aba.
        }
    }
}

function ler(chave: string | null): Lista {
    if (!chave) {
        return {};
    }

    try {
        const bruto = localStorage.getItem(chave);
        const valor: unknown = bruto ? JSON.parse(bruto) : {};

        return valor && typeof valor === 'object' ? (valor as Lista) : {};
    } catch {
        return {};
    }
}
