import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { RedacoesService } from '../redacoes/redacoes.service';
import { ChamadaService } from '../alunos/chamada.service';

/** Um passo do caminho mostrado no topo ("Redações › 8A-07 · Minha cidade"). */
export interface Migalha {
    /** Texto fixo, ou `:redacao` / `:aluno` para resolver pelo parâmetro da rota. */
    readonly rotulo: string;
    readonly link?: string;
}

interface Coleta {
    readonly migalhas: readonly Migalha[];
    readonly params: Readonly<Record<string, string>>;
}

/** Junta o `data.trilha` de cada rota ativa, da raiz até a página atual. */
export function coletarTrilha(raiz: ActivatedRouteSnapshot): Coleta {
    const migalhas: Migalha[] = [];
    let params: Record<string, string> = {};

    for (let rota: ActivatedRouteSnapshot | null = raiz; rota; rota = rota.firstChild) {
        // routeConfig.data é só da própria rota (o snapshot.data herda dos pais).
        const propria = rota.routeConfig?.data?.['trilha'] as readonly Migalha[] | undefined;
        migalhas.push(...(propria ?? []));
        params = { ...params, ...rota.params };
    }

    return { migalhas, params };
}

@Injectable({ providedIn: 'root' })
export class TrilhaService {
    private readonly router = inject(Router);
    private readonly redacoes = inject(RedacoesService);
    private readonly chamada = inject(ChamadaService);

    private readonly coleta = toSignal(
        this.router.events.pipe(
            filter((evento) => evento instanceof NavigationEnd),
            map(() => coletarTrilha(this.router.routerState.snapshot.root)),
        ),
        { initialValue: coletarTrilha(this.router.routerState.snapshot.root) },
    );

    readonly migalhas = computed<Migalha[]>(() => {
        const { migalhas, params } = this.coleta();

        return migalhas.map((migalha) => ({ ...migalha, rotulo: this.resolver(migalha.rotulo, params) }));
    });

    private resolver(rotulo: string, params: Readonly<Record<string, string>>): string {
        if (rotulo === ':redacao') {
            const redacao = this.redacoes.redacoes().find((item) => item.id === params['id']);

            return redacao ? `${this.chamada.rotulo(redacao.aluno)} · ${redacao.titulo}` : 'Redação';
        }

        if (rotulo === ':aluno') {
            return params['codigo'] ? this.chamada.rotulo(params['codigo']) : 'Aluno';
        }

        return rotulo;
    }
}
