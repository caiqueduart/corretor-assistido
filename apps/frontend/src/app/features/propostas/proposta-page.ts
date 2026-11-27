import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    effect,
    inject,
    input,
    signal,
    viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { progressoDe, progressoPorProposta } from '../../core/propostas/progresso';
import { Proposta, PropostasService, descreverPrazo, formatarPrazo } from '../../core/propostas/propostas.service';
import { contarDecisoes } from '../../core/redacoes/analise';
import { AlunosService } from '../../core/redacoes/alunos.service';
import { StatusRedacao } from '../../core/redacoes/redacao.model';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { ConfirmacaoService } from '../../core/ui/confirmacao.service';
import { Esqueleto } from '../../shared/esqueleto/esqueleto';
import { EstadoVazio } from '../../shared/estado-vazio/estado-vazio';
import { Icone } from '../../shared/icone/icone';
import { PropostaFormulario } from './proposta-formulario';
import { tomPrazo } from './propostas-page';
import { ChamadaService } from '../../core/alunos/chamada.service';
import { CodigosService } from '../../core/alunos/codigos.service';

const ROTULO_STATUS: Readonly<Record<StatusRedacao, string>> = {
    'aguardando-ia': 'Aguardando IA',
    corrigindo: 'Corrigindo',
    'em-revisao': 'Para revisar',
    devolvida: 'Devolvida',
};

@Component({
    selector: 'app-proposta-page',
    imports: [RouterLink, Esqueleto, EstadoVazio, Icone, PropostaFormulario],
    templateUrl: './proposta-page.html',
    styleUrl: './proposta-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropostaPage {
    protected readonly propostas = inject(PropostasService);
    protected readonly redacoes = inject(RedacoesService);
    private readonly alunos = inject(AlunosService);
    private readonly codigos = inject(CodigosService);
    protected readonly chamada = inject(ChamadaService);
    private readonly avisos = inject(AvisosService);
    private readonly confirmacao = inject(ConfirmacaoService);
    private readonly router = inject(Router);

    /** Vem do parâmetro `:id` da rota. */
    readonly id = input.required<string>();

    protected readonly rotuloStatus = ROTULO_STATUS;
    protected readonly descreverPrazo = descreverPrazo;
    protected readonly formatarPrazo = formatarPrazo;
    protected readonly tomPrazo = tomPrazo;
    protected readonly editando = signal(false);
    protected readonly ocupado = signal(false);
    private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');

    protected readonly proposta = computed(() => this.propostas.proposta(this.id()));
    protected readonly progresso = computed(() =>
        progressoDe(progressoPorProposta(this.redacoes.redacoes()), this.id()),
    );

    protected readonly itens = computed(() =>
        this.redacoes
            .redacoes()
            .filter((r) => r.propostaId === this.id())
            .sort((a, b) => a.aluno.localeCompare(b.aluno, 'pt-BR'))
            .map((redacao) => {
                const decisoes = contarDecisoes(redacao.apontamentos);

                return { redacao, feitas: decisoes.total - decisoes.pendentes, total: decisoes.total };
            }),
    );

    /** Alunos já acompanhados nas turmas da proposta que ainda não têm redação nela. */
    protected readonly semEntrega = computed(() => {
        const proposta = this.proposta();

        if (!proposta) {
            return [];
        }

        const entregaram = new Set(this.itens().map((item) => item.redacao.aluno));
        const comCodigo = new Set(this.codigos.ativos().map((c) => c.aluno));
        const turmaDe = new Map<string, string>();

        // Alunos já acompanhados (por redações) e os que só têm código de acesso.
        for (const aluno of this.alunos.alunos()) {
            turmaDe.set(aluno.codigo, aluno.turma);
        }
        for (const c of this.codigos.ativos()) {
            turmaDe.set(c.aluno, c.turma);
        }

        return [...turmaDe]
            .filter(([codigo, turma]) => proposta.turmas.includes(turma) && !entregaram.has(codigo))
            .map(([codigo, turma]) => ({
                codigo,
                turma,
                temCodigo: comCodigo.has(codigo),
                rotulo: this.chamada.rotulo(codigo),
            }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    });

    constructor() {
        // Mostra quem já tem código de acesso entre os que ainda não entregaram.
        if (!this.codigos.carregado()) {
            void this.codigos.carregar().catch(() => undefined);
        }

        effect(() => {
            const dialogo = this.dialogo()?.nativeElement;

            if (dialogo && this.editando() && !dialogo.open) {
                dialogo.showModal();
            } else if (dialogo && !this.editando() && dialogo.open) {
                dialogo.close();
            }
        });
    }

    protected aoSalvar(): void {
        this.editando.set(false);
        this.avisos.mostrar('Proposta atualizada');
    }

    protected async alternarEncerrada(proposta: Proposta): Promise<void> {
        const encerrar = !proposta.encerrada;

        if (
            encerrar &&
            !(await this.confirmacao.confirmar({
                titulo: 'Encerrar a proposta?',
                texto: 'Ela deixa de receber redações novas. As já importadas continuam no fluxo de revisão, e você pode reabrir depois.',
                confirmar: 'Encerrar',
            }))
        ) {
            return;
        }

        await this.executar(async () => {
            await this.propostas.alterar(proposta.id, { encerrada: encerrar });
            this.avisos.mostrar(encerrar ? 'Proposta encerrada' : 'Proposta reaberta');
        });
    }

    protected async excluir(proposta: Proposta): Promise<void> {
        const sim = await this.confirmacao.confirmar({
            titulo: 'Excluir a proposta?',
            texto: `"${proposta.tema}" será apagada. Isso não pode ser desfeito.`,
            confirmar: 'Excluir',
            perigo: true,
        });

        if (sim) {
            await this.executar(async () => {
                await this.propostas.excluir(proposta.id);
                this.avisos.mostrar('Proposta excluída');
                await this.router.navigate(['/propostas']);
            });
        }
    }

    private async executar(acao: () => Promise<void>): Promise<void> {
        this.ocupado.set(true);

        try {
            await acao();
        } catch (erro) {
            this.avisos.mostrar('Não foi possível concluir', {
                tipo: 'erro',
                texto: erro instanceof Error ? erro.message : undefined,
            });
        } finally {
            this.ocupado.set(false);
        }
    }
}
