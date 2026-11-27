import { Redacao } from '../redacoes/redacao.model';

export interface ProgressoProposta {
    readonly total: number;
    readonly aguardandoIa: number;
    readonly revisao: number;
    readonly devolvidas: number;
}

const VAZIO: ProgressoProposta = { total: 0, aguardandoIa: 0, revisao: 0, devolvidas: 0 };

/** Conta as redações de cada proposta por situação (calculado na tela, acompanha as mudanças na hora). */
export function progressoPorProposta(redacoes: readonly Redacao[]): ReadonlyMap<string, ProgressoProposta> {
    const mapa = new Map<string, ProgressoProposta>();

    for (const redacao of redacoes) {
        if (!redacao.propostaId) {
            continue;
        }

        const atual = mapa.get(redacao.propostaId) ?? VAZIO;
        mapa.set(redacao.propostaId, {
            total: atual.total + 1,
            aguardandoIa:
                atual.aguardandoIa + Number(redacao.status === 'aguardando-ia' || redacao.status === 'corrigindo'),
            revisao: atual.revisao + Number(redacao.status === 'em-revisao'),
            devolvidas: atual.devolvidas + Number(redacao.status === 'devolvida'),
        });
    }

    return mapa;
}

export function progressoDe(mapa: ReadonlyMap<string, ProgressoProposta>, id: string): ProgressoProposta {
    return mapa.get(id) ?? VAZIO;
}
