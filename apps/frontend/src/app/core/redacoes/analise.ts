import { Apontamento, Redacao, contarPalavras, foiValidado, textoFinal } from './redacao.model';

export type Trecho =
    | { readonly tipo: 'texto'; readonly texto: string }
    | { readonly tipo: 'apontamento'; readonly apontamento: Apontamento; readonly indice: number };

/** Quebra o texto em trechos simples e trechos apontados, na ordem de leitura. */
export function segmentar(conteudo: string, apontamentos: readonly Apontamento[]): Trecho[] {
    const trechos: Trecho[] = [];
    let posicao = 0;

    apontamentos.forEach((apontamento, indice) => {
        if (apontamento.inicio > posicao) {
            trechos.push({ tipo: 'texto', texto: conteudo.slice(posicao, apontamento.inicio) });
        }

        trechos.push({ tipo: 'apontamento', apontamento, indice });
        posicao = apontamento.fim;
    });

    if (posicao < conteudo.length) {
        trechos.push({ tipo: 'texto', texto: conteudo.slice(posicao) });
    }

    return trechos;
}

/** O que o estudante recebe: só os apontamentos validados pelo professor. */
export function apontamentosDaDevolutiva(redacao: Redacao): Apontamento[] {
    return redacao.apontamentos.filter(foiValidado);
}

export function textoCorrigido(redacao: Redacao): string {
    let resultado = '';
    let posicao = 0;

    for (const apontamento of redacao.apontamentos) {
        resultado += redacao.conteudo.slice(posicao, apontamento.inicio);
        resultado += foiValidado(apontamento) ? textoFinal(apontamento) : apontamento.trecho;
        posicao = apontamento.fim;
    }

    return resultado + redacao.conteudo.slice(posicao);
}

export interface ContagemDecisoes {
    readonly aceitas: number;
    readonly ajustadas: number;
    readonly recusadas: number;
    readonly pendentes: number;
    readonly total: number;
}

export function contarDecisoes(apontamentos: readonly Apontamento[]): ContagemDecisoes {
    const contar = (decisao: Apontamento['decisao']) =>
        apontamentos.filter((apontamento) => apontamento.decisao === decisao).length;

    return {
        aceitas: contar('aceita'),
        ajustadas: contar('ajustada'),
        recusadas: contar('recusada'),
        pendentes: contar(null),
        total: apontamentos.length,
    };
}

/** Desvios validados pelo professor a cada 100 palavras. */
export function desviosPor100Palavras(redacao: Redacao): number {
    const palavras = Math.max(1, contarPalavras(redacao.conteudo));

    return (100 * apontamentosDaDevolutiva(redacao).length) / palavras;
}

export interface SituacaoDesvio {
    readonly apontamento: Apontamento;
    /** O trecho original ainda aparece na versão seguinte. */
    readonly persistiu: boolean;
}

/** Para cada desvio validado na versão anterior, verifica se ele ainda aparece na reescrita. */
export function compararVersoes(anterior: Redacao, reescrita: Redacao): SituacaoDesvio[] {
    return apontamentosDaDevolutiva(anterior).map((apontamento) => ({
        apontamento,
        persistiu: new RegExp(`(^|[^\\p{L}])${escaparRegex(apontamento.trecho)}([^\\p{L}]|$)`, 'u').test(
            reescrita.conteudo,
        ),
    }));
}

function escaparRegex(texto: string): string {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
