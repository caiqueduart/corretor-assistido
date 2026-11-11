import { Injectable, computed, inject } from '@angular/core';

import { desviosPor100Palavras } from './analise';
import { PerfilSociolinguistico, Redacao } from './redacao.model';
import { RedacoesService } from './redacoes.service';

export interface Aluno {
    readonly codigo: string;
    readonly turma: string;
    readonly perfil: PerfilSociolinguistico;
    /** Versões em ordem, da primeira à mais recente. */
    readonly versoes: readonly Redacao[];
    /** Variação percentual de desvios entre a primeira e a última versão devolvida; negativo é melhora. */
    readonly variacao: number | null;
}

/**
 * Visão por estudante, derivada das redações. Quando houver API de alunos,
 * este service passa a consumi-la sem mudar as telas.
 */
@Injectable({ providedIn: 'root' })
export class AlunosService {
    private readonly redacoes = inject(RedacoesService);

    readonly alunos = computed<Aluno[]>(() => {
        const porCodigo = new Map<string, Redacao[]>();

        for (const redacao of this.redacoes.redacoes()) {
            porCodigo.set(redacao.aluno, [...(porCodigo.get(redacao.aluno) ?? []), redacao]);
        }

        return [...porCodigo.entries()]
            .map(([codigo, lista]) => {
                const versoes = [...lista].sort((a, b) => a.versao - b.versao || a.criadaEm.localeCompare(b.criadaEm));
                const devolvidas = versoes.filter((redacao) => redacao.status === 'devolvida');
                const primeira = devolvidas[0];
                const ultima = devolvidas.at(-1);
                const base = primeira ? desviosPor100Palavras(primeira) : 0;
                const variacao =
                    primeira && ultima && primeira !== ultima && base > 0
                        ? Math.round((100 * (desviosPor100Palavras(ultima) - base)) / base)
                        : null;

                return { codigo, turma: versoes[0].turma, perfil: versoes[0].perfil, versoes, variacao };
            })
            .sort((a, b) => a.codigo.localeCompare(b.codigo));
    });

    aluno(codigo: string): Aluno | undefined {
        return this.alunos().find((aluno) => aluno.codigo === codigo);
    }
}
