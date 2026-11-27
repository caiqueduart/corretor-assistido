import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { mensagemDeErro } from '../api/erro-api';
import { Decisao, NovaRedacao, Redacao } from './redacao.model';
import { RedacoesApi } from './redacoes.api';
import { TextoApi, decisaoParaApi, deTextoApi } from './redacoes-http.mapeamento';

interface RespostaImportacao {
    readonly criados: readonly TextoApi[];
    readonly erros: readonly { readonly arquivo: string; readonly mensagem: string }[];
}

const base = (id: string) => `/api/textos/${encodeURIComponent(id)}`;

/** `RedacoesApi` sobre o back-end em Go (`/api/textos`). */
@Injectable()
export class RedacoesHttpApi extends RedacoesApi {
    private readonly http = inject(HttpClient);

    async listar(): Promise<Redacao[]> {
        const resposta = await this.chamar(
            this.http.get<{ textos: TextoApi[] }>('/api/textos', { params: { completo: 'true' } }),
        );

        return resposta.textos.map(deTextoApi);
    }

    async importar(nova: NovaRedacao): Promise<Redacao> {
        const campos = {
            aluno_codigo: nova.aluno.trim(),
            turma: nova.turma.trim(),
            grupo: nova.perfil,
            titulo: nova.titulo.trim(),
            origem_id: nova.origemId ?? '',
            proposta_id: nova.propostaId ?? '',
        };

        if (!nova.arquivo) {
            const texto = await this.chamar(
                this.http.post<TextoApi>('/api/textos', {
                    ...campos,
                    conteudo: nova.textoColado,
                    consentimento: nova.consentimentoFamilia,
                }),
            );

            return deTextoApi(texto);
        }

        // Com arquivo, o back-end extrai o texto de PDF, DOCX ou TXT.
        const formulario = new FormData();
        Object.entries(campos).forEach(([campo, valor]) => formulario.append(campo, valor));
        formulario.append('consentimento', String(nova.consentimentoFamilia));
        formulario.append('arquivos', nova.arquivo, nova.arquivo.name);

        const resposta = await this.chamar(this.http.post<RespostaImportacao>('/api/textos/importar', formulario));
        const criado = resposta.criados[0];

        if (!criado) {
            throw new Error(resposta.erros[0]?.mensagem ?? 'Não foi possível ler o arquivo.');
        }

        return deTextoApi(criado);
    }

    /** Espera a correção terminar (motor de IA, ou o simulado se a IA não estiver configurada). */
    async corrigirComIa(id: string): Promise<Redacao> {
        const texto = deTextoApi(
            await this.chamar(this.http.post<TextoApi>(`${base(id)}/corrigir`, null, { params: { aguardar: 'true' } })),
        );

        // Se a correção falha, o back-end volta o texto para "pendente" e explica o motivo.
        if (texto.status === 'aguardando-ia' && texto.erroCorrecao) {
            throw new Error(texto.erroCorrecao);
        }

        return texto;
    }

    async decidir(
        id: string,
        apontamentoId: string,
        decisao: Decisao | null,
        textoProfessor?: string,
    ): Promise<Redacao> {
        await this.chamar(
            this.http.patch(`${base(id)}/apontamentos/${encodeURIComponent(apontamentoId)}`, {
                decisao: decisaoParaApi(decisao),
                ...(decisao === 'ajustada' ? { sugestao_final: textoProfessor?.trim() ?? '' } : {}),
            }),
        );

        return this.obter(id);
    }

    async decidirPendentes(id: string, decisao: Exclude<Decisao, 'ajustada'>): Promise<Redacao> {
        const texto = await this.chamar(
            this.http.post<TextoApi>(`${base(id)}/decisoes`, { decisao, apenas_pendentes: true }),
        );

        return deTextoApi(texto);
    }

    async salvarComentario(id: string, comentario: string): Promise<Redacao> {
        await this.chamar(this.http.put(`${base(id)}/comentario`, { comentario }));

        return this.obter(id);
    }

    async enviarDevolutiva(id: string): Promise<Redacao> {
        return deTextoApi(await this.chamar(this.http.post<TextoApi>(`${base(id)}/enviar`, {})));
    }

    async carregarExemplos(): Promise<number> {
        const resposta = await this.chamar(this.http.post<{ criados: number }>('/api/textos/exemplos', null));

        return resposta.criados;
    }

    private async obter(id: string): Promise<Redacao> {
        return deTextoApi(await this.chamar(this.http.get<TextoApi>(base(id))));
    }

    /** As telas mostram `erro.message`; converte o erro HTTP na mensagem pronta do back-end. */
    private async chamar<T>(requisicao: Observable<T>): Promise<T> {
        try {
            return await firstValueFrom(requisicao);
        } catch (erro) {
            throw new Error(mensagemDeErro(erro));
        }
    }
}
