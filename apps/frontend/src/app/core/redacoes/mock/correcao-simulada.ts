import { Apontamento, Criterio } from '../redacao.model';

type Regra = readonly [padrao: RegExp, sugestao: string, criterio: Criterio, explicacao: string, variacao: boolean];

/** Regras fixas que imitam a resposta da IA enquanto o back-end não existe. */
const REGRAS: readonly Regra[] = [
    [/\bportugues\b/g, 'português', 'Ortografia', 'Oxítona terminada em -es leva acento: português.', false],
    [/\bdificil\b/g, 'difícil', 'Ortografia', 'Paroxítona terminada em -l leva acento: difícil.', false],
    [/\bmatematica\b/g, 'matemática', 'Ortografia', 'Proparoxítona: matemática leva acento.', false],
    [/\bpais\b(?=\.)/g, 'país', 'Ortografia', 'Aqui é o substantivo “país”, com acento no i.', false],
    [/\bporem\b/g, 'porém', 'Ortografia', 'Oxítona terminada em -em leva acento: porém.', false],
    [/\btambem\b/g, 'também', 'Ortografia', 'Oxítona terminada em -em leva acento: também.', false],
    [/\bAlem\b/g, 'Além', 'Ortografia', 'Oxítona terminada em -em leva acento: além.', false],
    [/\bnoticia\b/g, 'notícia', 'Ortografia', 'Paroxítona terminada em ditongo leva acento: notícia.', false],
    [/\bja\b/g, 'já', 'Ortografia', 'O advérbio “já” é acentuado.', false],
    [/\bpra\b/g, 'para', 'Ortografia', '“Pra” é comum na fala. Em textos formais, prefira “para”.', true],
    [/novas porem/g, 'novas, porém', 'Pontuação', 'Use vírgula antes de “porém”, que indica oposição.', false],
    [/disso tem/g, 'disso, tem', 'Pontuação', 'Depois de “além disso” no início da frase, use vírgula.', false],
    [
        /Haiti a gente/g,
        'Haiti, a gente',
        'Pontuação',
        'Vírgula depois da expressão de lugar no início da frase.',
        false,
    ],
];

export interface ResultadoSimulado {
    readonly apontamentos: Apontamento[];
    readonly comentario: string;
}

export function corrigirSimulado(redacaoId: string, texto: string, criterios: readonly Criterio[]): ResultadoSimulado {
    const encontrados: Omit<Apontamento, 'id'>[] = [];

    for (const [padrao, sugestaoIa, criterio, explicacao, variacaoLinguistica] of REGRAS) {
        if (!criterios.includes(criterio)) {
            continue;
        }

        for (const match of texto.matchAll(padrao)) {
            const inicio = match.index ?? 0;
            encontrados.push({
                criterio,
                trecho: match[0],
                inicio,
                fim: inicio + match[0].length,
                sugestaoIa,
                explicacao,
                variacaoLinguistica,
                decisao: null,
                textoProfessor: null,
            });
        }
    }

    encontrados.sort((a, b) => a.inicio - b.inicio);

    const semSobreposicao: Apontamento[] = [];
    let fimAnterior = -1;

    for (const apontamento of encontrados) {
        if (apontamento.inicio >= fimAnterior) {
            semSobreposicao.push({ ...apontamento, id: `${redacaoId}-s${semSobreposicao.length + 1}` });
            fimAnterior = apontamento.fim;
        }
    }

    return {
        apontamentos: semSobreposicao,
        comentario:
            'Seu texto apresenta as ideias com clareza. Revise os pontos marcados para deixá-lo adequado a um texto formal.',
    };
}
