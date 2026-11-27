import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

/** Perfil padrão do back-end; não pode ser removido. */
export const GRUPO_NAO_INFORMADO = 'Não informado';

/** Critérios da especificação da POC; os demais ficam disponíveis só para teste. */
export const CRITERIOS_DA_POC: readonly string[] = ['Ortografia', 'Pontuação'];

/** Padrões do back-end (`dominio.ConfiguracaoPadrao`), usados se a configuração não puder ser lida. */
export const GRUPOS_PADRAO: readonly string[] = [
    GRUPO_NAO_INFORMADO,
    'Urbano',
    'Rural',
    'Migrante de outra região',
    'Bilíngue / outra língua materna',
];
export const LIMIAR_PADRAO = 15;

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

    /** Última configuração lida ou salva. Null antes do login ou se a leitura falhou. */
    private readonly ativa = signal<ConfiguracaoCorrecao | null>(null);

    /** Perfis que o professor pode escolher ao importar. */
    readonly grupos = computed(() => this.ativa()?.grupos ?? GRUPOS_PADRAO);
    /** Critérios que a IA aplica nas próximas correções. */
    readonly criterios = computed(() => this.ativa()?.criterios ?? CRITERIOS_DA_POC);
    /** Pontos percentuais acima da média que disparam o alerta de possível viés. */
    readonly limiarVies = computed(() => this.ativa()?.limiarVies ?? LIMIAR_PADRAO);

    async obter(): Promise<EstadoConfiguracao> {
        const estado = await firstValueFrom(this.http.get<EstadoConfiguracaoApi>('/api/config').pipe(map(deApi)));
        this.ativa.set(estado.configuracao);

        return estado;
    }

    async salvar(nova: NovaConfiguracao): Promise<EstadoConfiguracao> {
        const corpo = { criterios: nova.criterios, grupos: nova.grupos, limiar_vies: nova.limiarVies };
        const estado = await firstValueFrom(
            this.http.put<EstadoConfiguracaoApi>('/api/config', corpo).pipe(map(deApi)),
        );
        this.ativa.set(estado.configuracao);

        return estado;
    }

    /** Lê a configuração ao entrar. Sem ela, valem os padrões da POC. */
    async carregar(): Promise<void> {
        try {
            await this.obter();
        } catch {
            this.ativa.set(null);
        }
    }

    limpar(): void {
        this.ativa.set(null);
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
