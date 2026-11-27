import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { Perfil, ROTULO_PERFIL } from '../auth/auth.model';

export const LIMITES_AUDITORIA = [100, 500, 1000] as const;

export interface RegistroAuditoria {
    readonly id: number;
    readonly usuarioId: string | null;
    readonly acao: string;
    readonly entidade: string;
    readonly entidadeId: string;
    readonly detalhe: string;
    readonly criadoEm: string;
}

interface RegistroAuditoriaApi {
    readonly id: number;
    readonly usuario_id: string | null;
    readonly acao: string;
    readonly entidade: string;
    readonly entidade_id: string;
    readonly detalhe: string;
    readonly criado_em: string;
}

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
    private readonly http = inject(HttpClient);

    /** Registros mais recentes primeiro. A API não guarda conteúdo dos textos. */
    listar(limite: number): Promise<RegistroAuditoria[]> {
        const params = new HttpParams().set('limite', limite);

        return firstValueFrom(
            this.http.get<{ registros: RegistroAuditoriaApi[] }>('/api/auditoria', { params }).pipe(
                map((r) =>
                    r.registros.map((a) => ({
                        id: a.id,
                        usuarioId: a.usuario_id,
                        acao: a.acao,
                        entidade: a.entidade,
                        entidadeId: a.entidade_id,
                        detalhe: a.detalhe,
                        criadoEm: a.criado_em,
                    })),
                ),
            ),
        );
    }
}

export const ROTULO_ACAO: Readonly<Record<string, string>> = {
    login: 'Entrou no sistema',
    criar_usuario: 'Cadastrou usuário',
    alterar_usuario: 'Alterou usuário',
    alterar_config: 'Alterou a configuração',
    criar_texto: 'Importou texto',
    excluir_texto: 'Excluiu texto',
    carregar_exemplos: 'Carregou textos de exemplo',
    remover_exemplos: 'Removeu textos de exemplo',
    corrigir: 'Pediu a correção',
    decidir_todos: 'Decidiu toda a correção',
    enviar_devolutiva: 'Enviou devolutiva',
    criar_proposta: 'Criou proposta',
    alterar_proposta: 'Alterou proposta',
    excluir_proposta: 'Excluiu proposta',
    gerar_codigos: 'Gerou códigos de acesso',
    revogar_codigo: 'Revogou código de acesso',
    entrega_aluno: 'Enviou redação pela Área do aluno',
    reenvio_aluno: 'Trocou o texto pela Área do aluno',
};

/** Ações feitas pelo próprio aluno (sem usuário logado). */
const ACOES_DO_ALUNO = new Set(['entrega_aluno', 'reenvio_aluno']);

/** Quem fez: o nome do usuário, "Aluno" nas ações da Área do aluno ou "Sistema". */
export function autorDe(
    registro: Pick<RegistroAuditoria, 'usuarioId' | 'acao'>,
    nomes: ReadonlyMap<string, string>,
): string {
    if (registro.usuarioId) {
        return nomes.get(registro.usuarioId) ?? 'Usuário removido';
    }

    return ACOES_DO_ALUNO.has(registro.acao) ? 'Aluno' : 'Sistema';
}

export function rotuloAcao(acao: string): string {
    const texto = ROTULO_ACAO[acao] ?? acao.replaceAll('_', ' ');

    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Lê `chave=valor` separados por espaço; palavras soltas viram chave sem valor. */
function pares(detalhe: string): Map<string, string | null> {
    const resultado = new Map<string, string | null>();

    for (const parte of detalhe.split(' ').filter(Boolean)) {
        const i = parte.indexOf('=');
        resultado.set(i < 0 ? parte : parte.slice(0, i), i < 0 ? null : parte.slice(i + 1));
    }

    return resultado;
}

function rotuloPerfil(valor: string | null | undefined): string {
    return (valor && ROTULO_PERFIL[valor as Perfil]) ?? valor ?? '';
}

/** Detalhe do registro em português, para leitura humana. */
export function descreverDetalhe(registro: Pick<RegistroAuditoria, 'acao' | 'detalhe'>): string {
    const { acao, detalhe } = registro;

    if (!detalhe) {
        return '';
    }

    const p = pares(detalhe);

    switch (acao) {
        case 'criar_texto': {
            const origem = p.get('origem');
            const deOnde = origem === 'colado' ? 'texto colado' : origem ? `arquivo ${origem.toUpperCase()}` : '';

            return [p.get('versao') && `versão ${p.get('versao')}`, deOnde].filter(Boolean).join(' · ');
        }
        case 'carregar_exemplos':
        case 'remover_exemplos':
            return `${detalhe} ${detalhe === '1' ? 'texto' : 'textos'}`;
        case 'corrigir': {
            const motor =
                p.get('motor') === 'ia' ? 'IA' : p.get('motor') === 'simulado' ? 'motor simulado' : p.get('motor');
            const n = p.get('apontamentos');

            return [motor, n && `${n} ${n === '1' ? 'apontamento' : 'apontamentos'}`].filter(Boolean).join(' · ');
        }
        case 'decidir_todos': {
            const verbo =
                p.get('decisao') === 'aceita' ? 'Aceitou' : p.get('decisao') === 'recusada' ? 'Recusou' : 'Decidiu';
            const n = p.get('apontamentos') ?? '?';

            const pendentes = p.get('pendentes') === 'true' ? (n === '1' ? ' pendente' : ' pendentes') : '';

            return `${verbo} ${n} ${n === '1' ? 'apontamento' : 'apontamentos'}${pendentes}`;
        }
        case 'alterar_config': {
            const criterios = p.get('criterios')?.split(',').join(', ');

            return [criterios && `critérios: ${criterios}`, p.get('limiar') && `limiar ${p.get('limiar')} p.p.`]
                .filter(Boolean)
                .join(' · ');
        }
        case 'criar_usuario':
            return `perfil ${rotuloPerfil(p.get('perfil'))}`;
        case 'alterar_usuario': {
            const partes: string[] = [];

            if (p.has('nome')) partes.push('nome alterado');
            if (p.has('perfil')) partes.push(`perfil ${rotuloPerfil(p.get('perfil'))}`);
            if (p.has('ativo')) partes.push(p.get('ativo') === 'true' ? 'acesso reativado' : 'acesso desativado');
            if (p.has('senha')) partes.push('senha redefinida');

            return partes.join(' · ') || detalhe;
        }
        default:
            return detalhe;
    }
}

/** Sobre o que a ação foi feita: um usuário (pelo nome), um texto ou a configuração. */
export function descreverAlvo(
    registro: Pick<RegistroAuditoria, 'acao' | 'entidade' | 'entidadeId' | 'usuarioId'>,
    nomes: ReadonlyMap<string, string>,
): string {
    const { acao, entidade, entidadeId } = registro;

    switch (entidade) {
        case 'usuario':
            // No login, o alvo é o próprio autor; repetir o nome não ajuda.
            return acao === 'login' ? '' : (nomes.get(entidadeId) ?? `usuário ${entidadeId.slice(0, 8)}`);
        case 'texto':
            return entidadeId ? `texto ${entidadeId.slice(0, 8)}` : 'textos de exemplo';
        case 'configuracao':
            return 'configuração da correção';
        case 'proposta':
            return 'proposta de redação';
        case 'codigo':
            return entidadeId ? `aluno ${entidadeId}` : '';
        default:
            return entidadeId ? `${entidade} ${entidadeId}` : entidade;
    }
}
