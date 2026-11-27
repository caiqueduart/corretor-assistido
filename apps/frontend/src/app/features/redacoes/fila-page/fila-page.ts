import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { contarDecisoes } from '../../../core/redacoes/analise';
import { Redacao, StatusRedacao, contarPalavras } from '../../../core/redacoes/redacao.model';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Esqueleto } from '../../../shared/esqueleto/esqueleto';
import { EstadoVazio } from '../../../shared/estado-vazio/estado-vazio';
import { Icone, NomeIcone } from '../../../shared/icone/icone';
import { normalizar } from '../../../layout/busca-rapida/busca';
import { PropostasService } from '../../../core/propostas/propostas.service';

type Aba = 'revisar' | 'aguardando' | 'devolvidas' | 'todas';

interface DefinicaoAba {
    readonly id: Aba;
    readonly rotulo: string;
    readonly status: readonly StatusRedacao[];
    readonly vazio: { readonly titulo: string; readonly texto: string; readonly icone: NomeIcone };
}

const ABAS: readonly DefinicaoAba[] = [
    {
        id: 'revisar',
        rotulo: 'Para revisar',
        status: ['em-revisao'],
        vazio: {
            titulo: 'Nenhuma correção esperando você',
            texto: 'Quando a IA terminar de corrigir, a redação aparece aqui para você decidir.',
            icone: 'aceitar',
        },
    },
    {
        id: 'aguardando',
        rotulo: 'Aguardando a IA',
        status: ['aguardando-ia', 'corrigindo'],
        vazio: {
            titulo: 'Todas já passaram pela IA',
            texto: 'Importe uma redação nova para pedir a correção.',
            icone: 'relogio',
        },
    },
    {
        id: 'devolvidas',
        rotulo: 'Registradas',
        status: ['devolvida'],
        vazio: {
            titulo: 'Nenhuma devolutiva registrada ainda',
            texto: 'Depois de revisar, registre a devolutiva: ela aparece aqui.',
            icone: 'selo',
        },
    },
    {
        id: 'todas',
        rotulo: 'Todas',
        status: ['em-revisao', 'aguardando-ia', 'corrigindo', 'devolvida'],
        vazio: { titulo: 'Nenhuma redação', texto: '', icone: 'redacoes' },
    },
];

const ROTULO_STATUS: Readonly<Record<StatusRedacao, string>> = {
    'em-revisao': 'Para revisar',
    'aguardando-ia': 'Aguardando IA',
    corrigindo: 'Corrigindo',
    devolvida: 'Registrada',
};

@Component({
    selector: 'app-fila-page',
    imports: [RouterLink, DatePipe, CabecalhoPagina, Icone, Esqueleto, EstadoVazio],
    templateUrl: './fila-page.html',
    styleUrl: './fila-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilaPage {
    protected readonly redacoes = inject(RedacoesService);
    private readonly avisos = inject(AvisosService);

    protected readonly abas = ABAS;
    protected readonly rotuloStatus = ROTULO_STATUS;
    protected readonly erros = signal<Readonly<Record<string, string>>>({});
    protected readonly carregandoExemplos = signal(false);

    protected readonly aba = signal<Aba>('revisar');
    protected readonly busca = signal('');
    protected readonly turma = signal('');
    /** '' = todas, 'avulsas' = sem proposta, ou o id da proposta. */
    protected readonly proposta = signal('');
    protected readonly propostas = inject(PropostasService);

    protected readonly turmas = computed(() =>
        [
            ...new Set(
                this.redacoes
                    .redacoes()
                    .map((r) => r.turma)
                    .filter(Boolean),
            ),
        ].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );

    /** Redações que passam pela busca e pelo filtro de turma (antes de separar por aba). */
    private readonly filtradas = computed(() => {
        const termo = normalizar(this.busca());
        const turma = this.turma();

        return [...this.redacoes.redacoes()]
            .filter((r) => !turma || r.turma === turma)
            .filter((r) => {
                const proposta = this.proposta();

                return !proposta || (proposta === 'avulsas' ? !r.propostaId : r.propostaId === proposta);
            })
            .filter((r) => !termo || normalizar(`${r.aluno} ${r.titulo}`).includes(termo))
            .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
    });

    protected readonly contagem = computed(() => {
        const lista = this.filtradas();

        return Object.fromEntries(
            ABAS.map((aba) => [aba.id, lista.filter((r) => aba.status.includes(r.status)).length]),
        ) as Record<Aba, number>;
    });

    protected readonly abaAtual = computed(() => ABAS.find((aba) => aba.id === this.aba()) ?? ABAS[0]);

    protected readonly itens = computed(() =>
        this.filtradas()
            .filter((r) => this.abaAtual().status.includes(r.status))
            .map((redacao) => {
                const decisoes = contarDecisoes(redacao.apontamentos);

                return {
                    redacao,
                    feitas: decisoes.total - decisoes.pendentes,
                    total: decisoes.total,
                    palavras: contarPalavras(redacao.conteudo),
                };
            }),
    );

    protected readonly temFiltro = computed(() => !!(this.busca().trim() || this.turma() || this.proposta()));

    protected limparFiltros(): void {
        this.busca.set('');
        this.turma.set('');
        this.proposta.set('');
    }

    protected async carregarExemplos(): Promise<void> {
        this.carregandoExemplos.set(true);

        try {
            const criados = await this.redacoes.carregarExemplos();
            this.avisos.mostrar('Textos de exemplo carregados', {
                texto: criados
                    ? `${criados} redações fictícias prontas para testar.`
                    : 'Os exemplos já estavam carregados.',
            });
        } catch (erro) {
            this.avisos.mostrar('Não foi possível carregar os exemplos', {
                tipo: 'erro',
                texto: erro instanceof Error ? erro.message : undefined,
            });
        } finally {
            this.carregandoExemplos.set(false);
        }
    }

    protected async corrigir(redacao: Redacao): Promise<void> {
        this.erros.update(({ [redacao.id]: _, ...resto }) => resto);

        try {
            await this.redacoes.corrigirComIa(redacao.id);
            const corrigida = this.redacoes.redacoes().find((r) => r.id === redacao.id);
            const n = corrigida?.apontamentos.length ?? 0;
            this.avisos.mostrar(`Correção pronta: ${redacao.aluno}`, {
                texto: n
                    ? `${n} ${n === 1 ? 'apontamento' : 'apontamentos'} para você revisar.`
                    : 'A IA não encontrou desvios.',
            });
        } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : 'A correção falhou. Tente de novo.';
            this.erros.update((atual) => ({ ...atual, [redacao.id]: mensagem }));
        }
    }
}
