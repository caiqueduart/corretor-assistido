import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnInit,
    computed,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';

import { ChamadaService } from '../../../core/alunos/chamada.service';
import { CodigoAtivo, CodigoGerado, CodigosService, imprimirCodigos } from '../../../core/alunos/codigos.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { ConfirmacaoService } from '../../../core/ui/confirmacao.service';
import { EstadoVazio } from '../../../shared/estado-vazio/estado-vazio';
import { Icone } from '../../../shared/icone/icone';
import { tempoRelativo } from '../../../shared/tempo';
import { PrepararTurma } from '../preparar-turma/preparar-turma';

/** Quem pode enviar pela Área do aluno: códigos ativos, gerar, regenerar e revogar. */
@Component({
    selector: 'app-acesso-alunos',
    imports: [Icone, EstadoVazio, PrepararTurma],
    templateUrl: './acesso-alunos.html',
    styleUrl: './acesso-alunos.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcessoAlunos implements OnInit {
    protected readonly codigos = inject(CodigosService);
    protected readonly chamada = inject(ChamadaService);
    private readonly avisos = inject(AvisosService);
    private readonly confirmacao = inject(ConfirmacaoService);

    protected readonly tempo = tempoRelativo;
    protected readonly erro = signal<string | null>(null);
    protected readonly preparando = signal(false);
    /** Código recém-gerado para um aluno: aparece uma única vez. */
    protected readonly novo = signal<CodigoGerado | null>(null);
    private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');

    protected readonly linhas = computed(() =>
        this.codigos
            .ativos()
            .map((c) => ({ ...c, rotulo: this.chamada.rotulo(c.aluno) }))
            .sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR') || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    );

    constructor() {
        effect(() => {
            const dialogo = this.dialogo()?.nativeElement;

            if (dialogo && this.preparando() && !dialogo.open) {
                dialogo.showModal();
            } else if (dialogo && !this.preparando() && dialogo.open) {
                dialogo.close();
            }
        });
    }

    async ngOnInit(): Promise<void> {
        try {
            await this.codigos.carregar();
        } catch (erro) {
            this.erro.set(erro instanceof Error ? erro.message : 'Não foi possível carregar os códigos.');
        }
    }

    protected async regenerar(c: CodigoAtivo): Promise<void> {
        const sim = await this.confirmacao.confirmar({
            titulo: `Gerar um novo código para ${this.chamada.rotulo(c.aluno)}?`,
            texto: 'O código atual deixa de funcionar. Use quando o aluno perder o dele.',
            confirmar: 'Gerar novo código',
        });

        if (!sim) {
            return;
        }

        try {
            const [gerado] = await this.codigos.gerar([{ aluno: c.aluno, turma: c.turma, grupo: c.grupo }], true);
            this.novo.set(gerado);
        } catch (erro) {
            this.avisos.mostrar('Não foi possível gerar', {
                tipo: 'erro',
                texto: erro instanceof Error ? erro.message : undefined,
            });
        }
    }

    protected async revogar(c: CodigoAtivo): Promise<void> {
        const sim = await this.confirmacao.confirmar({
            titulo: `Revogar o código de ${this.chamada.rotulo(c.aluno)}?`,
            texto: 'O aluno não consegue mais enviar redações nem ver devolutivas até receber um código novo.',
            confirmar: 'Revogar',
            perigo: true,
        });

        if (!sim) {
            return;
        }

        try {
            await this.codigos.revogar(c.aluno);
            this.avisos.mostrar('Código revogado');
        } catch (erro) {
            this.avisos.mostrar('Não foi possível revogar', {
                tipo: 'erro',
                texto: erro instanceof Error ? erro.message : undefined,
            });
        }
    }

    protected imprimirNovo(gerado: CodigoGerado): void {
        imprimirCodigos([{ ...gerado, nome: this.chamada.nome(gerado.aluno) }]);
    }
}
