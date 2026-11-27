import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { mensagemDeErro } from '../api/erro-api';

export interface EntregaAluno {
    readonly textoId: string;
    readonly status: 'pendente' | 'corrigindo' | 'revisao' | 'concluido';
    readonly podeReenviar: boolean;
}

export interface PropostaAluno {
    readonly id: string;
    readonly tema: string;
    readonly genero: string;
    readonly enunciado: string;
    readonly prazo: string | null;
    readonly entrega: EntregaAluno | null;
}

export interface PainelAluno {
    readonly aluno: string;
    readonly turma: string;
    readonly propostas: readonly PropostaAluno[];
    readonly devolutivas: readonly { readonly textoId: string; readonly titulo: string; readonly enviadoEm: string }[];
}

export interface DevolutivaAluno {
    readonly titulo: string;
    readonly comentario: string;
    readonly textoCorrigido: string;
    readonly paraReescrita: readonly { criterio: string; trecho: string; correcao: string; explicacao: string }[];
}

interface PainelApi {
    aluno: string;
    turma: string;
    propostas: {
        id: string;
        tema: string;
        genero: string;
        enunciado: string;
        prazo: string | null;
        entrega: { texto_id: string; status: EntregaAluno['status']; pode_reenviar: boolean } | null;
    }[];
    devolutivas: { texto_id: string; titulo: string; enviado_em: string }[];
}

const CHAVE = 'corretor.area-aluno';

/**
 * Área do aluno: só o código de acesso, sem conta. O código fica no
 * sessionStorage (some ao fechar a aba), pensando em computador compartilhado.
 */
@Injectable({ providedIn: 'root' })
export class AreaAlunoService {
    private readonly http = inject(HttpClient);

    readonly codigo = signal<string | null>(ler());
    readonly painel = signal<PainelAluno | null>(null);

    async entrar(codigo: string): Promise<PainelAluno> {
        const limpo = codigo.trim().toUpperCase();
        const resposta = await this.chamar(this.http.post<PainelApi>('/api/aluno/acesso', { codigo: limpo }));
        const painel = deApi(resposta);

        this.codigo.set(limpo);
        this.painel.set(painel);
        guardar(limpo);

        return painel;
    }

    /** Atualiza o painel com o código guardado (ex.: depois de enviar). */
    async atualizar(): Promise<void> {
        const codigo = this.codigo();

        if (codigo) {
            await this.entrar(codigo);
        }
    }

    sair(): void {
        this.codigo.set(null);
        this.painel.set(null);
        guardar(null);
    }

    async enviarTexto(propostaId: string, conteudo: string): Promise<boolean> {
        const r = await this.chamar(
            this.http.post<{ reenvio: boolean }>('/api/aluno/entregas', {
                codigo: this.codigo(),
                proposta_id: propostaId,
                conteudo,
            }),
        );

        return r.reenvio;
    }

    async enviarArquivo(propostaId: string, arquivo: File): Promise<boolean> {
        const formulario = new FormData();
        formulario.append('codigo', this.codigo() ?? '');
        formulario.append('proposta_id', propostaId);
        formulario.append('arquivo', arquivo, arquivo.name);

        return (await this.chamar(this.http.post<{ reenvio: boolean }>('/api/aluno/entregas', formulario))).reenvio;
    }

    async devolutiva(textoId: string): Promise<DevolutivaAluno> {
        const r = await this.chamar(
            this.http.post<{
                titulo: string;
                comentario: string;
                texto_corrigido: string;
                para_reescrita: DevolutivaAluno['paraReescrita'];
            }>('/api/aluno/devolutiva', { codigo: this.codigo(), texto_id: textoId }),
        );

        return {
            titulo: r.titulo,
            comentario: r.comentario,
            textoCorrigido: r.texto_corrigido,
            paraReescrita: r.para_reescrita,
        };
    }

    private async chamar<T>(requisicao: Observable<T>): Promise<T> {
        try {
            return await firstValueFrom(requisicao);
        } catch (erro) {
            throw new Error(mensagemDeErro(erro));
        }
    }
}

function deApi(r: PainelApi): PainelAluno {
    return {
        aluno: r.aluno,
        turma: r.turma,
        propostas: r.propostas.map((p) => ({
            id: p.id,
            tema: p.tema,
            genero: p.genero,
            enunciado: p.enunciado,
            prazo: p.prazo,
            entrega: p.entrega
                ? { textoId: p.entrega.texto_id, status: p.entrega.status, podeReenviar: p.entrega.pode_reenviar }
                : null,
        })),
        devolutivas: r.devolutivas.map((d) => ({ textoId: d.texto_id, titulo: d.titulo, enviadoEm: d.enviado_em })),
    };
}

function ler(): string | null {
    try {
        return sessionStorage.getItem(CHAVE);
    } catch {
        return null;
    }
}

function guardar(codigo: string | null): void {
    try {
        if (codigo) {
            sessionStorage.setItem(CHAVE, codigo);
        } else {
            sessionStorage.removeItem(CHAVE);
        }
    } catch {
        // Sem armazenamento: vale só enquanto a página estiver aberta.
    }
}
