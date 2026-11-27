import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { mensagemDeErro } from '../api/erro-api';

export interface Proposta {
    readonly id: string;
    readonly tema: string;
    readonly genero: string;
    readonly enunciado: string;
    readonly turmas: readonly string[];
    /** AAAA-MM-DD; informativo, não bloqueia importações. */
    readonly prazo: string | null;
    readonly encerrada: boolean;
    readonly criadoPor: string | null;
    readonly criadoEm: string;
}

export interface DadosProposta {
    readonly tema: string;
    readonly genero: string;
    readonly enunciado: string;
    readonly turmas: readonly string[];
    readonly prazo: string | null;
}

interface PropostaApi {
    readonly id: string;
    readonly tema: string;
    readonly genero: string;
    readonly enunciado: string;
    readonly turmas: string[];
    readonly prazo: string | null;
    readonly encerrada: boolean;
    readonly criado_por: string | null;
    readonly criado_em: string;
}

/** Mesma lista do back-end (`dominio.GenerosTextuais`), usada até a primeira carga. */
export const GENEROS_PADRAO: readonly string[] = [
    'Dissertativo-argumentativo',
    'Narrativo',
    'Artigo de opinião',
    'Carta argumentativa',
    'Relato',
    'Outro',
];

function deApi(p: PropostaApi): Proposta {
    return {
        id: p.id,
        tema: p.tema,
        genero: p.genero,
        enunciado: p.enunciado,
        turmas: p.turmas,
        prazo: p.prazo,
        encerrada: p.encerrada,
        criadoPor: p.criado_por,
        criadoEm: p.criado_em,
    };
}

const DIA = 86_400_000;

/** Dias até o prazo (negativo se venceu), contando datas locais. Null sem prazo. */
export function diasAtePrazo(prazo: string | null, hoje = new Date()): number | null {
    if (!prazo) {
        return null;
    }

    const [ano, mes, dia] = prazo.split('-').map(Number);
    const limite = new Date(ano, mes - 1, dia).getTime();
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();

    return Math.round((limite - inicioHoje) / DIA);
}

/** "vence hoje", "vence amanhã", "vence em 3 dias", "venceu há 2 dias" ou "sem prazo". */
export function descreverPrazo(prazo: string | null, hoje = new Date()): string {
    const dias = diasAtePrazo(prazo, hoje);

    if (dias === null) {
        return 'sem prazo';
    }
    if (dias === 0) {
        return 'vence hoje';
    }
    if (dias === 1) {
        return 'vence amanhã';
    }
    if (dias > 1) {
        return `vence em ${dias} dias`;
    }

    return dias === -1 ? 'venceu ontem' : `venceu há ${-dias} dias`;
}

/** "10/12" a partir de "2026-12-10", sem passar por fuso horário. */
export function formatarPrazo(prazo: string | null): string {
    if (!prazo) {
        return '';
    }

    const [, mes, dia] = prazo.split('-');

    return `${dia}/${mes}`;
}

/** Propostas de redação: estado na tela e chamadas à API (`/api/propostas`). */
@Injectable({ providedIn: 'root' })
export class PropostasService {
    private readonly http = inject(HttpClient);

    private readonly estado = signal<readonly Proposta[]>([]);
    private carregamento: Promise<void> | null = null;

    readonly propostas = this.estado.asReadonly();
    readonly carregado = signal(false);
    readonly erroCarga = signal<string | null>(null);
    readonly generos = signal<readonly string[]>(GENEROS_PADRAO);

    readonly abertas = computed(() => this.estado().filter((p) => !p.encerrada));

    carregar(): Promise<void> {
        this.carregamento ??= firstValueFrom(
            this.http.get<{ propostas: PropostaApi[]; generos: string[] }>('/api/propostas'),
        ).then(
            (resposta) => {
                this.estado.set(resposta.propostas.map(deApi));
                this.generos.set(resposta.generos);
                this.erroCarga.set(null);
                this.carregado.set(true);
            },
            (erro: unknown) => {
                this.carregamento = null;
                this.erroCarga.set(mensagemDeErro(erro, 'Não foi possível carregar as propostas.'));
            },
        );

        return this.carregamento;
    }

    limpar(): void {
        this.carregamento = null;
        this.estado.set([]);
        this.carregado.set(false);
        this.erroCarga.set(null);
    }

    proposta(id: string | null | undefined): Proposta | undefined {
        return id ? this.estado().find((p) => p.id === id) : undefined;
    }

    async criar(dados: DadosProposta): Promise<Proposta> {
        const criada = deApi(await this.chamar(this.http.post<PropostaApi>('/api/propostas', dados)));
        this.estado.update((lista) => [criada, ...lista]);

        return criada;
    }

    async alterar(id: string, alteracao: Partial<DadosProposta> & { encerrada?: boolean }): Promise<Proposta> {
        const atual = deApi(
            await this.chamar(this.http.patch<PropostaApi>(`/api/propostas/${encodeURIComponent(id)}`, alteracao)),
        );
        this.estado.update((lista) => lista.map((p) => (p.id === atual.id ? atual : p)));

        return atual;
    }

    async excluir(id: string): Promise<void> {
        await this.chamar(this.http.delete(`/api/propostas/${encodeURIComponent(id)}`));
        this.estado.update((lista) => lista.filter((p) => p.id !== id));
    }

    /** As telas mostram `erro.message`: converte o erro HTTP na mensagem pronta do back-end. */
    private async chamar<T>(requisicao: Observable<T>): Promise<T> {
        try {
            return await firstValueFrom(requisicao);
        } catch (erro) {
            throw new Error(mensagemDeErro(erro));
        }
    }
}
