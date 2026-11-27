/** Critério de correção. Os ativos são definidos pelo admin (`/api/config`). */
export type Criterio = string;

/** Critérios da especificação da POC, usados quando a configuração não está disponível. */
export const CRITERIOS: readonly Criterio[] = ['Ortografia', 'Pontuação'];

/** Perfis padrão do back-end, usados quando a configuração não está disponível. */
export const PERFIS_SOCIOLINGUISTICOS: readonly PerfilSociolinguistico[] = [
    'Não informado',
    'Urbano',
    'Rural',
    'Migrante de outra região',
    'Bilíngue / outra língua materna',
];

/** Perfil sociolinguístico. A lista é definida pelo admin (`/api/config`). */
export type PerfilSociolinguistico = string;

/**
 * aguardando-ia: importada, ainda sem correção.
 * corrigindo: a IA está processando.
 * em-revisao: a IA já apontou; o professor decide.
 * devolvida: o professor validou e enviou ao estudante.
 */
export type StatusRedacao = 'aguardando-ia' | 'corrigindo' | 'em-revisao' | 'devolvida';

export type Decisao = 'aceita' | 'ajustada' | 'recusada';

export interface Apontamento {
    readonly id: string;
    readonly criterio: Criterio;
    /** Trecho exato do texto do estudante. */
    readonly trecho: string;
    readonly inicio: number;
    readonly fim: number;
    readonly sugestaoIa: string;
    readonly explicacao: string;
    /** A IA indicou que a forma é própria de uma variedade linguística, não um erro de escrita. */
    readonly variacaoLinguistica: boolean;
    readonly decisao: Decisao | null;
    /** Texto escrito pelo professor quando a decisão é "ajustada". */
    readonly textoProfessor: string | null;
}

export interface Redacao {
    readonly id: string;
    /** Código do estudante. O nome nunca entra no sistema. */
    readonly aluno: string;
    readonly turma: string;
    readonly perfil: PerfilSociolinguistico;
    readonly titulo: string;
    readonly versao: number;
    /** Redação da qual esta é reescrita. */
    readonly origemId: string | null;
    readonly conteudo: string;
    readonly status: StatusRedacao;
    readonly apontamentos: readonly Apontamento[];
    readonly comentarioIa: string;
    readonly comentarioProfessor: string;
    readonly criadaEm: string;
    readonly enviadaEm: string | null;
    /** Texto fictício de demonstração. */
    readonly exemplo: boolean;
    /** Motivo da última correção que falhou, para o professor tentar de novo. */
    readonly erroCorrecao?: string;
}

export interface NovaRedacao {
    readonly aluno: string;
    readonly turma: string;
    readonly perfil: PerfilSociolinguistico;
    readonly titulo: string;
    readonly origemId: string | null;
    readonly consentimentoFamilia: boolean;
    /** Arquivo PDF, TXT ou DOCX. Quando ausente, usa o texto colado. */
    readonly arquivo: File | null;
    readonly textoColado: string;
}

export function textoFinal(apontamento: Apontamento): string {
    if (apontamento.decisao === 'ajustada') {
        return apontamento.textoProfessor ?? apontamento.sugestaoIa;
    }

    return apontamento.sugestaoIa;
}

export function foiValidado(apontamento: Apontamento): boolean {
    return apontamento.decisao === 'aceita' || apontamento.decisao === 'ajustada';
}

export function contarPalavras(texto: string): number {
    return (texto.match(/[\p{L}\p{N}'-]+/gu) ?? []).length;
}
