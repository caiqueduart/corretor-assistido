import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Colunas do CSV, na ordem do back-end. Sem conteúdo dos textos nem código do estudante. */
export const COLUNAS_DECISOES = [
    'texto_id',
    'versao',
    'turma',
    'grupo',
    'motor',
    'criterio',
    'variacao',
    'decisao',
    'decidido_em',
] as const;

/** Nome do arquivo: decisoes[-turma]-AAAA-MM-DD.csv */
export function nomeArquivoDecisoes(turma: string, hoje = new Date()): string {
    const data = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()]
        .map((n) => String(n).padStart(2, '0'))
        .join('-');
    const sufixo = turma
        // NFKD também decompõe "º" em "o" (8º A → 8o-a).
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    return `decisoes${sufixo ? `-${sufixo}` : ''}-${data}.csv`;
}

@Injectable({ providedIn: 'root' })
export class DecisoesCsvService {
    private readonly http = inject(HttpClient);

    /**
     * Baixa o CSV com uma linha por decisão do professor. A rota exige o token no
     * cabeçalho, por isso o arquivo vem pelo HttpClient e não por um link direto.
     */
    async baixar(turma = ''): Promise<void> {
        const params = turma.trim() ? new HttpParams().set('turma', turma.trim()) : undefined;
        const arquivo = await firstValueFrom(
            this.http.get('/api/metricas/decisoes.csv', { params, responseType: 'blob' }),
        );

        salvarArquivo(arquivo, nomeArquivoDecisoes(turma.trim()));
    }
}

function salvarArquivo(conteudo: Blob, nome: string): void {
    const url = URL.createObjectURL(conteudo);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
