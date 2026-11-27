import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { mensagemDeErro } from '../api/erro-api';

export interface CodigoAtivo {
    readonly aluno: string;
    readonly turma: string;
    readonly grupo: string;
    readonly criadoEm: string;
    readonly ultimoUso: string | null;
}

export interface PedidoCodigo {
    readonly aluno: string;
    readonly turma: string;
    readonly grupo?: string;
}

export interface CodigoGerado {
    readonly aluno: string;
    readonly turma: string;
    readonly codigo: string;
}

interface CodigoApi {
    aluno_codigo: string;
    turma: string;
    grupo: string;
    criado_em: string;
    ultimo_uso: string | null;
}

/** Códigos de acesso dos alunos (envio sem conta). Os códigos só aparecem ao gerar. */
@Injectable({ providedIn: 'root' })
export class CodigosService {
    private readonly http = inject(HttpClient);

    /** Alunos com código ativo (sem o código em si). */
    readonly ativos = signal<readonly CodigoAtivo[]>([]);
    readonly carregado = signal(false);

    async carregar(): Promise<void> {
        const r = await this.chamar(
            this.http.get<{ codigos: CodigoApi[] }>('/api/codigos', { params: new HttpParams() }),
        );
        this.ativos.set(
            r.codigos.map((c) => ({
                aluno: c.aluno_codigo,
                turma: c.turma,
                grupo: c.grupo,
                criadoEm: c.criado_em,
                ultimoUso: c.ultimo_uso,
            })),
        );
        this.carregado.set(true);
    }

    /** Gera (ou regenera) os códigos. Devolve os códigos para mostrar uma única vez. */
    async gerar(alunos: readonly PedidoCodigo[], consentimento: boolean): Promise<CodigoGerado[]> {
        const r = await this.chamar(
            this.http.post<{ codigos: { aluno_codigo: string; turma: string; codigo: string }[] }>('/api/codigos', {
                consentimento,
                alunos: alunos.map((a) => ({ aluno_codigo: a.aluno, turma: a.turma, grupo: a.grupo ?? '' })),
            }),
        );
        await this.carregar();

        return r.codigos.map((c) => ({ aluno: c.aluno_codigo, turma: c.turma, codigo: c.codigo }));
    }

    async revogar(aluno: string): Promise<void> {
        await this.chamar(this.http.delete(`/api/codigos/${encodeURIComponent(aluno)}`));
        this.ativos.update((lista) => lista.filter((c) => c.aluno !== aluno));
    }

    limpar(): void {
        this.ativos.set([]);
        this.carregado.set(false);
    }

    private async chamar<T>(requisicao: Observable<T>): Promise<T> {
        try {
            return await firstValueFrom(requisicao);
        } catch (erro) {
            throw new Error(mensagemDeErro(erro));
        }
    }
}

/** Abre uma página simples para imprimir ou salvar a lista de códigos (o código não aparece de novo). */
export function imprimirCodigos(itens: readonly (CodigoGerado & { nome: string | null })[]): void {
    const esc = (t: string) =>
        t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const linhas = itens
        .map(
            (i) =>
                `<tr><td>${esc(i.nome ?? '')}</td><td>${esc(i.aluno)}</td><td>${esc(i.turma)}</td><td class="c">${esc(i.codigo)}</td></tr>`,
        )
        .join('');
    const janela = window.open('', '_blank');

    if (!janela) {
        return;
    }

    janela.document
        .write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Códigos de acesso</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#18181b}h1{font-size:1.25rem}p{color:#52525b;font-size:.9rem}
table{border-collapse:collapse;width:100%;margin-top:1rem}td,th{border:1px solid #d4d4d8;padding:.5rem .75rem;text-align:left}
th{background:#f4f4f5;font-size:.8rem;text-transform:uppercase}.c{font-family:ui-monospace,Consolas,monospace;font-size:1.1rem;letter-spacing:.1em}</style>
</head><body><h1>Códigos de acesso dos alunos</h1>
<p>Entregue a cada aluno o seu código. Ele envia a redação em <strong>${esc(location.origin)}/aluno</strong>. Guarde esta lista: os códigos não aparecem de novo no sistema.</p>
<table><thead><tr><th>Nome (só neste computador)</th><th>Apelido</th><th>Turma</th><th>Código</th></tr></thead><tbody>${linhas}</tbody></table>
<script>window.print()</script></body></html>`);
    janela.document.close();
}
