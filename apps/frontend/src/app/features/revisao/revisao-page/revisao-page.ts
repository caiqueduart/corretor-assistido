import { DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    input,
    signal,
    untracked,
    viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { apontamentosDaDevolutiva, contarDecisoes } from '../../../core/redacoes/analise';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { Icone } from '../../../shared/icone/icone';
import { ApontamentoItem, EventoDecisao } from '../apontamento-item/apontamento-item';
import { Devolutiva } from '../devolutiva/devolutiva';
import { TextoMarcado } from '../texto-marcado/texto-marcado';

type Visao = 'revisao' | 'aluno';

@Component({
    selector: 'app-revisao-page',
    imports: [RouterLink, DatePipe, Icone, TextoMarcado, ApontamentoItem, Devolutiva],
    templateUrl: './revisao-page.html',
    styleUrls: ['./revisao-page.scss', './mesa.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(document:keydown)': 'atalho($event)' },
})
export class RevisaoPage {
    protected readonly redacoes = inject(RedacoesService);

    /** Vem do parâmetro `:id` da rota. */
    readonly id = input.required<string>();

    protected readonly redacao = this.redacoes.redacao(this.id);
    protected readonly selecionadoId = signal<string | null>(null);
    protected readonly visao = signal<Visao>('revisao');
    protected readonly confirmandoEnvio = signal(false);
    protected readonly erro = signal<string | null>(null);

    private readonly itens = viewChildren(ApontamentoItem);

    protected readonly apontamentos = computed(() => this.redacao()?.apontamentos ?? []);
    protected readonly decisoes = computed(() => contarDecisoes(this.apontamentos()));
    protected readonly validados = computed(() => {
        const redacao = this.redacao();

        return redacao ? apontamentosDaDevolutiva(redacao).length : 0;
    });
    protected readonly ocupada = computed(() => this.redacoes.ocupada(this.id()));

    constructor() {
        // Ao abrir uma redação, começa pelo primeiro apontamento sem decisão.
        effect(() => {
            const apontamentos = this.apontamentos();

            untracked(() => {
                if (!apontamentos.some((apontamento) => apontamento.id === this.selecionadoId())) {
                    this.selecionadoId.set((apontamentos.find((a) => !a.decisao) ?? apontamentos[0])?.id ?? null);
                }
            });
        });

        effect(() => {
            if (this.redacao()?.status === 'devolvida') {
                untracked(() => this.visao.set('aluno'));
            }
        });
    }

    protected selecionar(apontamentoId: string, rolar = false): void {
        this.selecionadoId.set(apontamentoId);

        if (rolar) {
            document
                .getElementById(`apontamento-${apontamentoId}`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    protected async decidir(apontamentoId: string, evento: EventoDecisao): Promise<void> {
        this.erro.set(null);

        if (evento.decisao) {
            this.avancar(apontamentoId);
        }

        try {
            await this.redacoes.decidir(this.id(), apontamentoId, evento.decisao, evento.textoProfessor);
        } catch (erro) {
            this.mostrarErro(erro);
        }
    }

    protected async decidirPendentes(decisao: 'aceita' | 'recusada'): Promise<void> {
        await this.tentar(() => this.redacoes.decidirPendentes(this.id(), decisao));
    }

    protected async corrigirComIa(): Promise<void> {
        await this.tentar(() => this.redacoes.corrigirComIa(this.id()));
    }

    protected async salvarComentario(comentario: string): Promise<void> {
        if (comentario !== this.redacao()?.comentarioProfessor) {
            await this.tentar(() => this.redacoes.salvarComentario(this.id(), comentario));
        }
    }

    protected async enviar(): Promise<void> {
        await this.tentar(() => this.redacoes.enviarDevolutiva(this.id()));
        this.confirmandoEnvio.set(false);
    }

    protected atalho(evento: KeyboardEvent): void {
        const alvo = evento.target as HTMLElement;

        if (
            this.redacao()?.status !== 'em-revisao' ||
            this.visao() !== 'revisao' ||
            evento.ctrlKey ||
            evento.metaKey ||
            evento.altKey ||
            alvo.closest('input, textarea, select')
        ) {
            return;
        }

        const atual = this.selecionadoId();
        const tecla = evento.key.toLowerCase();

        if (tecla === 'arrowdown' || tecla === 'j' || tecla === 'arrowup' || tecla === 'k') {
            evento.preventDefault();
            this.mover(tecla === 'arrowdown' || tecla === 'j' ? 1 : -1);
        } else if (atual && (tecla === 'a' || tecla === 'r')) {
            evento.preventDefault();
            void this.decidir(atual, { decisao: tecla === 'a' ? 'aceita' : 'recusada' });
        } else if (atual && tecla === 'e') {
            evento.preventDefault();
            this.itens()
                .find((item) => item.apontamento().id === atual)
                ?.abrirAjuste();
        }
    }

    private mover(passo: number): void {
        const lista = this.apontamentos();
        const indice = lista.findIndex((apontamento) => apontamento.id === this.selecionadoId());
        const proximo = lista[Math.min(lista.length - 1, Math.max(0, indice + passo))];

        if (proximo) {
            this.selecionar(proximo.id, true);
        }
    }

    /** Depois de decidir, segue para o próximo apontamento sem decisão. */
    private avancar(decididoId: string): void {
        const lista = this.apontamentos();
        const indice = lista.findIndex((apontamento) => apontamento.id === decididoId);
        const proximo = [...lista.slice(indice + 1), ...lista.slice(0, indice)].find((a) => !a.decisao);

        if (proximo) {
            this.selecionar(proximo.id, true);
        }
    }

    private async tentar(acao: () => Promise<void>): Promise<void> {
        this.erro.set(null);

        try {
            await acao();
        } catch (erro) {
            this.mostrarErro(erro);
        }
    }

    private mostrarErro(erro: unknown): void {
        this.erro.set(erro instanceof Error ? erro.message : 'Algo deu errado. Tente de novo.');
    }
}
