import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

/** Perfil padrão do back-end; não pode ser removido. */
export const GRUPO_NAO_INFORMADO = 'Não informado';

/** Critérios da especificação da POC; os demais ficam disponíveis só para teste. */
export const CRITERIOS_DA_POC: readonly string[] = ['Ortografia', 'Pontuação'];

export const LIMITES_CONFIG = {
    limiarMinimo: 5,
    limiarMaximo: 50,
    maximoGrupos: 30,
    tamanhoMaximoGrupo: 60,
} as const;

export interface CriterioDisponivel {
    readonly id: string;
    readonly descricao: string;
}

export interface ConfiguracaoCorrecao {
    readonly criterios: readonly string[];
    readonly grupos: readonly string[];
    readonly limiarVies: number;
    readonly atualizadoEm: string | null;
    readonly atualizadoPor: string | null;
}

export interface EstadoConfiguracao {
    readonly configuracao: ConfiguracaoCorrecao;
    readonly criteriosDisponiveis: readonly CriterioDisponivel[];
    readonly iaConfigurada: boolean;
}

export interface NovaConfiguracao {
    readonly criterios: readonly string[];
    readonly grupos: readonly string[];
    readonly limiarVies: number;
}

interface EstadoConfiguracaoApi {
    readonly configuracao: {
        readonly criterios: string[];
        readonly grupos: string[];
        readonly limiar_vies: number;
        readonly atualizado_em: string | null;
        readonly atualizado_por: string | null;
    };
    readonly criterios_disponiveis: CriterioDisponivel[];
    readonly ia_configurada: boolean;
}

function deApi(r: EstadoConfiguracaoApi): EstadoConfiguracao {
    const c = r.configuracao;
    // Datas zeradas do Go (configuração nunca salva) viram null.
    const atualizadoEm = c.atualizado_em && !c.atualizado_em.startsWith('0001-') ? c.atualizado_em : null;

    return {
        configuracao: {
            criterios: c.criterios,
            grupos: c.grupos,
            limiarVies: c.limiar_vies,
            atualizadoEm,
            atualizadoPor: c.atualizado_por,
        },
        criteriosDisponiveis: r.criterios_disponiveis,
        iaConfigurada: r.ia_configurada,
    };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
    private readonly http = inject(HttpClient);

    obter(): Promise<EstadoConfiguracao> {
        return firstValueFrom(this.http.get<EstadoConfiguracaoApi>('/api/config').pipe(map(deApi)));
    }

    salvar(nova: NovaConfiguracao): Promise<EstadoConfiguracao> {
        const corpo = { criterios: nova.criterios, grupos: nova.grupos, limiar_vies: nova.limiarVies };

        return firstValueFrom(this.http.put<EstadoConfiguracaoApi>('/api/config', corpo).pipe(map(deApi)));
    }
}

/**
 * Valida a lista de perfis como o back-end faz e devolve a primeira mensagem de
 * erro, ou null. Os perfis vêm sem "Não informado", que é sempre incluído.
 */
export function validarGrupos(grupos: readonly string[]): string | null {
    const vistos = new Set<string>([GRUPO_NAO_INFORMADO.toLowerCase()]);

    for (const bruto of grupos) {
        const grupo = bruto.trim();

        if (!grupo) {
            return 'Preencha ou remova o perfil em branco.';
        }
        if ([...grupo].length > LIMITES_CONFIG.tamanhoMaximoGrupo) {
            return `Cada perfil aceita até ${LIMITES_CONFIG.tamanhoMaximoGrupo} caracteres.`;
        }
        if (vistos.has(grupo.toLowerCase())) {
            return `O perfil "${grupo}" aparece mais de uma vez.`;
        }
        vistos.add(grupo.toLowerCase());
    }

    if (vistos.size > LIMITES_CONFIG.maximoGrupos) {
        return `Use no máximo ${LIMITES_CONFIG.maximoGrupos} perfis, contando "${GRUPO_NAO_INFORMADO}".`;
    }

    return null;
}
