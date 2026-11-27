/** Os perfis previstos na POC. */
export type Perfil = 'admin' | 'professor';

export const PERFIS: readonly Perfil[] = ['admin', 'professor'];

export const ROTULO_PERFIL: Readonly<Record<Perfil, string>> = {
    admin: 'Administrador',
    professor: 'Professor',
};

export const DESCRICAO_PERFIL: Readonly<Record<Perfil, string>> = {
    admin: 'Cadastra usuários, define a configuração da correção e acompanha métricas e auditoria.',
    professor: 'Importa, corrige, valida e registra devolutivas.',
};

/** Tela inicial de cada perfil: o professor trabalha nas redações; o admin, na administração. */
export function rotaInicial(perfil: Perfil | null): string {
    return perfil === 'admin' ? '/admin' : '/redacoes';
}

export interface Usuario {
    readonly id: string;
    readonly nome: string;
    readonly email: string;
    readonly perfil: Perfil;
    readonly ativo: boolean;
    readonly criadoEm: string;
}

/** Formato do usuário na API (snake_case). */
export interface UsuarioApi {
    readonly id: string;
    readonly nome: string;
    readonly email: string;
    readonly perfil: Perfil;
    readonly ativo: boolean;
    readonly criado_em: string;
}

export function deUsuarioApi(u: UsuarioApi): Usuario {
    return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo, criadoEm: u.criado_em };
}
