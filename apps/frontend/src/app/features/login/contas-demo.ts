import { Perfil } from '../../core/auth/auth.model';

export interface ContaDemo {
    readonly perfil: Perfil;
    readonly descricao: string;
    readonly email: string;
    readonly senha: string;
}

/**
 * Contas de teste do banco local, para o "Acesso rápido" do login.
 * Só aparecem em modo de desenvolvimento (`ng serve`); o build de produção não
 * mostra o bloco. Se o banco for recriado, cadastre estas contas de novo
 * (Administração › Usuários) ou ajuste os dados aqui.
 */
export const CONTAS_DEMO: readonly ContaDemo[] = [
    {
        perfil: 'admin',
        descricao: 'Usuários, configuração e auditoria.',
        email: 'admin@escola.exemplo',
        senha: 'senha-de-teste-123',
    },
    {
        perfil: 'professor',
        descricao: 'Importa, corrige, valida e registra devolutivas.',
        email: 'professor@escola.exemplo',
        senha: 'senha-professor-1',
    },
];
