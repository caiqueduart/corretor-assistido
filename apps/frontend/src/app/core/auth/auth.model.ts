export type Perfil = 'admin' | 'professor' | 'leitura';

export const PERFIS: readonly Perfil[] = ['admin', 'professor', 'leitura'];

export const ROTULO_PERFIL: Readonly<Record<Perfil, string>> = {
    admin: 'Administrador',
    professor: 'Professor',
    leitura: 'Leitura',
};

export const DESCRICAO_PERFIL: Readonly<Record<Perfil, string>> = {
    admin: 'Tudo, mais usuários, configuração da correção e auditoria.',
    professor: 'Importa, corrige, revisa e envia devolutivas.',
    leitura: 'Só consulta textos, devolutivas e métricas.',
};

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
