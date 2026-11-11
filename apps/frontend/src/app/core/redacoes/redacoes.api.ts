import { Decisao, NovaRedacao, Redacao } from './redacao.model';

/**
 * Contrato de acesso às redações. Hoje é atendido por `RedacoesMockApi`;
 * quando o back-end existir, basta registrar uma implementação HTTP em `app.config.ts`.
 */
export abstract class RedacoesApi {
    abstract listar(): Promise<Redacao[]>;

    abstract importar(nova: NovaRedacao): Promise<Redacao>;

    /** Pede à IA a correção segundo os critérios ativos. */
    abstract corrigirComIa(id: string): Promise<Redacao>;

    abstract decidir(
        id: string,
        apontamentoId: string,
        decisao: Decisao | null,
        textoProfessor?: string,
    ): Promise<Redacao>;

    /** Aplica a mesma decisão a todos os apontamentos ainda sem decisão. */
    abstract decidirPendentes(id: string, decisao: Exclude<Decisao, 'ajustada'>): Promise<Redacao>;

    abstract salvarComentario(id: string, comentario: string): Promise<Redacao>;

    /** Valida a revisão e libera a devolutiva ao estudante. */
    abstract enviarDevolutiva(id: string): Promise<Redacao>;
}
