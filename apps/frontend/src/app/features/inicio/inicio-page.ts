import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { contarDecisoes } from '../../core/redacoes/analise';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { Esqueleto } from '../../shared/esqueleto/esqueleto';
import { EstadoVazio } from '../../shared/estado-vazio/estado-vazio';
import { Icone, NomeIcone } from '../../shared/icone/icone';
import { saudacao, tempoRelativo } from '../../shared/tempo';
import { InicioAdmin } from './inicio-admin';
import { ChamadaService } from '../../core/alunos/chamada.service';

interface Indicador {
    readonly rotulo: string;
    readonly valor: number;
    readonly detalhe: string;
    readonly icone: NomeIcone;
    readonly link: string;
    readonly atencao?: boolean;
}

const SEMANA = 7 * 24 * 3_600_000;

/** Tela inicial: o que importa para cada perfil, logo depois do login. */
@Component({
    selector: 'app-inicio-page',
    imports: [RouterLink, DatePipe, Icone, Esqueleto, EstadoVazio, InicioAdmin],
    templateUrl: './inicio-page.html',
    styleUrl: './inicio-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioPage {
    protected readonly chamada = inject(ChamadaService);
    private readonly auth = inject(AuthService);
    protected readonly redacoes = inject(RedacoesService);

    protected readonly admin = computed(() => this.auth.temPerfil('admin'));
    protected readonly tempo = tempoRelativo;

    protected readonly titulo = computed(() => `${saudacao()}, ${(this.auth.usuario()?.nome ?? '').split(/\s+/)[0]}`);

    protected readonly subtitulo = computed(() => {
        return this.admin()
            ? 'Visão geral do corretor, da equipe e da atividade recente.'
            : 'Veja as redações que esperam a sua revisão.';
    });

    protected readonly indicadores = computed<Indicador[]>(() => {
        const grupos = this.redacoes.porStatus();
        const desde = Date.now() - SEMANA;
        const naSemana = grupos.devolvidas.filter((r) => r.enviadaEm && Date.parse(r.enviadaEm) >= desde).length;
        const falhas = grupos.aguardandoIa.filter((r) => r.erroCorrecao).length;

        return [
            {
                rotulo: 'Para revisar',
                valor: grupos.emRevisao.length,
                detalhe: 'esperando a decisão do professor',
                icone: 'lapis',
                link: '/redacoes',
            },
            {
                rotulo: 'Aguardando a IA',
                valor: grupos.aguardandoIa.length,
                detalhe: falhas ? `${falhas} com falha na correção` : 'ainda sem correção',
                icone: 'relogio',
                link: '/redacoes',
                atencao: falhas > 0,
            },
            {
                rotulo: 'Devolutivas na semana',
                valor: naSemana,
                detalhe: `${grupos.devolvidas.length} registradas no total`,
                icone: 'selo',
                link: '/redacoes',
            },
        ];
    });

    /** Revisões começadas primeiro, depois as mais antigas: é por onde o professor retoma. */
    protected readonly continuar = computed(() =>
        this.redacoes
            .porStatus()
            .emRevisao.map((redacao) => {
                const decisoes = contarDecisoes(redacao.apontamentos);
                const feitas = decisoes.total - decisoes.pendentes;

                return {
                    redacao,
                    feitas,
                    total: decisoes.total,
                    progresso: decisoes.total ? Math.round((100 * feitas) / decisoes.total) : 100,
                };
            })
            .sort(
                (a, b) =>
                    Number(b.feitas > 0) - Number(a.feitas > 0) || a.redacao.criadaEm.localeCompare(b.redacao.criadaEm),
            )
            .slice(0, 5),
    );

    protected readonly falhas = computed(() =>
        this.redacoes
            .porStatus()
            .aguardandoIa.filter((r) => r.erroCorrecao)
            .slice(0, 3),
    );

    protected readonly ultimasDevolutivas = computed(() =>
        [...this.redacoes.porStatus().devolvidas]
            .sort((a, b) => (b.enviadaEm ?? '').localeCompare(a.enviadaEm ?? ''))
            .slice(0, 5),
    );
}
