import { Apontamento, Decisao, Redacao, StatusRedacao } from './redacao.model';

/** Formatos do back-end (snake_case). Só os campos que a interface usa. */
export type StatusApi = 'pendente' | 'corrigindo' | 'revisao' | 'concluido';
export type DecisaoApi = 'aceita' | 'recusada' | 'editada';

export interface ApontamentoApi {
    readonly id: string;
    readonly criterio: string;
    readonly trecho: string;
    readonly inicio: number;
    readonly fim: number;
    readonly sugestao: string;
    readonly explicacao: string;
    readonly variacao: boolean;
    readonly decisao: DecisaoApi | null;
    readonly sugestao_final: string | null;
}

export interface TextoApi {
    readonly id: string;
    readonly aluno_codigo: string;
    readonly turma: string;
    readonly grupo: string;
    readonly titulo: string;
    readonly versao: number;
    readonly origem_id: string | null;
    readonly conteudo: string;
    readonly status: StatusApi;
    readonly exemplo: boolean;
    readonly comentario_ia: string;
    readonly comentario_professor: string;
    readonly erro_correcao: string;
    readonly criado_em: string;
    readonly enviado_em: string | null;
    readonly apontamentos?: readonly ApontamentoApi[];
}

const STATUS: Readonly<Record<StatusApi, StatusRedacao>> = {
    pendente: 'aguardando-ia',
    corrigindo: 'corrigindo',
    revisao: 'em-revisao',
    concluido: 'devolvida',
};

const DECISAO: Readonly<Record<DecisaoApi, Decisao>> = {
    aceita: 'aceita',
    recusada: 'recusada',
    editada: 'ajustada',
};

export function decisaoParaApi(decisao: Decisao | null): DecisaoApi | null {
    return decisao === 'ajustada' ? 'editada' : decisao;
}

export function deApontamentoApi(a: ApontamentoApi): Apontamento {
    return {
        id: a.id,
        criterio: a.criterio,
        trecho: a.trecho,
        inicio: a.inicio,
        fim: a.fim,
        sugestaoIa: a.sugestao,
        explicacao: a.explicacao,
        variacaoLinguistica: a.variacao,
        decisao: a.decisao ? DECISAO[a.decisao] : null,
        textoProfessor: a.decisao === 'editada' ? a.sugestao_final : null,
    };
}

export function deTextoApi(t: TextoApi): Redacao {
    return {
        id: t.id,
        aluno: t.aluno_codigo,
        turma: t.turma,
        perfil: t.grupo,
        titulo: t.titulo || 'Sem título',
        versao: t.versao,
        origemId: t.origem_id,
        conteudo: t.conteudo,
        status: STATUS[t.status] ?? 'aguardando-ia',
        apontamentos: (t.apontamentos ?? []).map(deApontamentoApi),
        comentarioIa: t.comentario_ia,
        comentarioProfessor: t.comentario_professor,
        criadaEm: t.criado_em,
        enviadaEm: t.enviado_em,
        exemplo: t.exemplo,
        erroCorrecao: t.erro_correcao || undefined,
    };
}
