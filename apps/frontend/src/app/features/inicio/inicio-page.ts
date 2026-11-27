import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AlunosService } from '../../core/redacoes/alunos.service';
import { contarDecisoes } from '../../core/redacoes/analise';
import { StatusRedacao } from '../../core/redacoes/redacao.model';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { Esqueleto } from '../../shared/esqueleto/esqueleto';
import { EstadoVazio } from '../../shared/estado-vazio/estado-vazio';
import { Icone, NomeIcone } from '../../shared/icone/icone';
import { saudacao, tempoRelativo } from '../../shared/tempo';
import { InicioAdmin } from './inicio-admin';

interface Indicador {
    readonly rotulo: string;
    readonly valor: number;
    readonly detalhe: string;
    readonly icone: NomeIcone;
    readonly link: string;
    readonly atencao?: boolean;
}

const SEMANA = 7 * 24 * 3_600_000;

const ROTULO_STATUS: Readonly<Record<StatusRedacao, string>> = {
    'em-revisao': 'Para revisar',
    'aguardando-ia': 'Aguardando IA',
    corrigindo: 'Corrigindo',
    devolvida: 'Devolvidas',
};

/** Tela inicial: o que importa para cada perfil, logo depois do login. */
@Component({
    selector: 'app-inicio-page',
    imports: [RouterLink, DatePipe, Icone, Esqueleto, EstadoVazio, InicioAdmin],
    templateUrl: './inicio-page.html',
    styleUrl: './inicio-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioPage {
    private readonly auth = inject(AuthService);
    private readonly alunos = inject(AlunosService);
    protected readonly redacoes = inject(RedacoesService);

    protected readonly escritor = computed(() => this.auth.temPerfil('admin', 'professor'));
    protected readonly admin = computed(() => this.auth.temPerfil('admin'));
    protected readonly tempo = tempoRelativo;

    protected readonly titulo = computed(() => `${saudacao()}, ${(this.auth.usuario()?.nome ?? '').split(/\s+/)[0]}`);

    protected readonly subtitulo = computed(() => {
        switch (this.auth.perfil()) {
            case 'admin':
                return 'Visão geral do corretor, da equipe e dos resultados da POC.';
            case 'professor':
                return 'Veja o que espera a sua revisão. Nada chega ao aluno sem o seu envio.';
            default:
                return 'Acompanhe o andamento das correções e das devolutivas.';
        }
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
                rotulo: 'Devolvidas na semana',
                valor: naSemana,
                detalhe: `${grupos.devolvidas.length} no total`,
                icone: 'enviar',
                link: '/redacoes',
            },
            {
                rotulo: 'Alunos',
                valor: this.alunos.alunos().length,
                detalhe: 'acompanhados na POC',
                icone: 'alunos',
                link: '/alunos',
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

    /** Distribuição por situação, para o perfil leitura. */
    protected readonly distribuicao = computed(() => {
        const todas = this.redacoes.redacoes();
        const total = todas.length || 1;
        const ordem: StatusRedacao[] = ['devolvida', 'em-revisao', 'aguardando-ia', 'corrigindo'];

        return ordem
            .map((status) => {
                const quantidade = todas.filter((r) => r.status === status).length;

                return { status, rotulo: ROTULO_STATUS[status], quantidade, porcentagem: (100 * quantidade) / total };
            })
            .filter((linha) => linha.quantidade > 0);
    });
}
