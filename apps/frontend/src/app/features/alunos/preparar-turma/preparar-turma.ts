import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { ConfigService, GRUPO_NAO_INFORMADO } from '../../../core/admin/config.service';
import { gerarApelido } from '../../../core/alunos/apelidos';
import { ChamadaService } from '../../../core/alunos/chamada.service';
import { CodigoGerado, CodigosService, imprimirCodigos } from '../../../core/alunos/codigos.service';
import { AlunosService } from '../../../core/redacoes/alunos.service';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { Icone } from '../../../shared/icone/icone';

const MAXIMO = 60;

/**
 * Prepara a turma para o envio pelos alunos: cadastra alunos novos (apelidos
 * sorteados) e gera os códigos de acesso. Os códigos aparecem só aqui, uma vez.
 * Com `regenerar`, gera direto o novo código de um aluno.
 */
@Component({
    selector: 'app-preparar-turma',
    imports: [Icone],
    templateUrl: './preparar-turma.html',
    styleUrl: './preparar-turma.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrepararTurma {
    private readonly codigos = inject(CodigosService);
    private readonly alunos = inject(AlunosService);
    private readonly redacoes = inject(RedacoesService);
    protected readonly chamada = inject(ChamadaService);
    protected readonly grupos = inject(ConfigService).grupos;

    /** Turma já escolhida (ex.: vindo da página da proposta). */
    readonly turmaInicial = input('');
    readonly fechado = output<void>();

    protected readonly turma = signal('');
    protected readonly novos = signal(0);
    protected readonly grupo = signal(GRUPO_NAO_INFORMADO);
    protected readonly consentimento = signal(false);
    protected readonly marcados = signal<ReadonlySet<string>>(new Set());
    protected readonly gerando = signal(false);
    protected readonly erro = signal<string | null>(null);
    protected readonly resultado = signal<CodigoGerado[] | null>(null);

    protected readonly turmasConhecidas = computed(() =>
        [...new Set([...this.redacoes.redacoes().map((r) => r.turma), ...this.codigos.ativos().map((c) => c.turma)])]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );

    /** Alunos já acompanhados na turma, com a informação de quem já tem código. */
    protected readonly existentes = computed(() => {
        const turma = this.turma().trim();
        const comCodigo = new Set(this.codigos.ativos().map((c) => c.aluno));
        const nomes = new Map<string, string>();

        for (const a of this.alunos.alunos()) {
            if (a.turma === turma) {
                nomes.set(a.codigo, a.perfil);
            }
        }
        for (const c of this.codigos.ativos()) {
            if (c.turma === turma) {
                nomes.set(c.aluno, c.grupo);
            }
        }

        return [...nomes]
            .map(([aluno, grupo]) => ({
                aluno,
                grupo,
                temCodigo: comCodigo.has(aluno),
                rotulo: this.chamada.rotulo(aluno),
            }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    });

    protected readonly total = computed(() => this.novos() + this.marcados().size);

    ngOnInit(): void {
        if (this.turmaInicial()) {
            this.escolherTurma(this.turmaInicial());
        }
    }

    protected escolherTurma(turma: string): void {
        this.turma.set(turma);
        // Por padrão, marca quem ainda não tem código.
        this.marcados.set(
            new Set(
                this.existentes()
                    .filter((a) => !a.temCodigo)
                    .map((a) => a.aluno),
            ),
        );
    }

    protected alternar(aluno: string): void {
        this.marcados.update((atual) => {
            const proximo = new Set(atual);
            proximo.has(aluno) ? proximo.delete(aluno) : proximo.add(aluno);

            return proximo;
        });
    }

    protected async gerar(): Promise<void> {
        const turma = this.turma().trim();

        if (!turma || !this.total() || this.total() > MAXIMO || !this.consentimento()) {
            this.erro.set(
                !turma
                    ? 'Informe a turma.'
                    : !this.total()
                      ? 'Escolha alunos ou informe quantos alunos novos cadastrar.'
                      : this.total() > MAXIMO
                        ? `Gere no máximo ${MAXIMO} códigos por vez.`
                        : 'Confirme o consentimento das famílias.',
            );
            return;
        }

        // Apelidos novos sem repetir os que já existem.
        const emUso = new Set([
            ...this.alunos.alunos().map((a) => a.codigo),
            ...this.codigos.ativos().map((c) => c.aluno),
        ]);
        const novos = Array.from({ length: this.novos() }, () => {
            const apelido = gerarApelido(emUso);
            emUso.add(apelido);

            return { aluno: apelido, turma, grupo: this.grupo() };
        });
        const existentes = this.existentes()
            .filter((a) => this.marcados().has(a.aluno))
            .map((a) => ({ aluno: a.aluno, turma, grupo: a.grupo }));

        this.gerando.set(true);
        this.erro.set(null);

        try {
            this.resultado.set(await this.codigos.gerar([...existentes, ...novos], true));
        } catch (erro) {
            this.erro.set(erro instanceof Error ? erro.message : 'Não foi possível gerar os códigos.');
        } finally {
            this.gerando.set(false);
        }
    }

    protected imprimir(): void {
        imprimirCodigos((this.resultado() ?? []).map((c) => ({ ...c, nome: this.chamada.nome(c.aluno) })));
    }
}
