import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ConfigService, GRUPO_NAO_INFORMADO } from '../../../core/admin/config.service';
import { AlunosService } from '../../../core/redacoes/alunos.service';
import { PropostasService, descreverPrazo } from '../../../core/propostas/propostas.service';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Icone } from '../../../shared/icone/icone';
import { AvisosService } from '../../../core/ui/avisos.service';

const EXTENSOES_ACEITAS = ['pdf', 'txt', 'docx'];

@Component({
    selector: 'app-importar-page',
    imports: [ReactiveFormsModule, RouterLink, CabecalhoPagina, Icone],
    templateUrl: './importar-page.html',
    styleUrl: './importar-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportarPage implements OnInit {
    private readonly redacoes = inject(RedacoesService);
    private readonly router = inject(Router);
    private readonly avisos = inject(AvisosService);
    private readonly alunos = inject(AlunosService);
    private readonly propostas = inject(PropostasService);

    /** Query params (?proposta=&aluno=) vindos da página da proposta. */
    readonly proposta = input<string>();
    readonly aluno = input<string>();

    protected readonly abertas = this.propostas.abertas;
    protected readonly descreverPrazo = descreverPrazo;

    /** Perfis definidos pelo admin em Administração › Configuração. */
    protected readonly perfis = inject(ConfigService).grupos;

    protected readonly formulario = inject(NonNullableFormBuilder).group({
        /** Código do aluno (novo) ou o de um aluno já acompanhado. Nunca o nome. */
        aluno: ['', [Validators.required, Validators.maxLength(40)]],
        /** Proposta de redação; vazio = redação avulsa. */
        propostaId: [''],
        turma: ['', Validators.required],
        titulo: [''],
        perfil: [GRUPO_NAO_INFORMADO],
        textoColado: [''],
        consentimentoFamilia: [false, Validators.requiredTrue],
    });

    protected readonly arquivo = signal<File | null>(null);
    protected readonly erroArquivo = signal<string | null>(null);
    protected readonly erroEnvio = signal<string | null>(null);
    protected readonly enviando = signal(false);

    private readonly valores = toSignal(this.formulario.valueChanges, { initialValue: this.formulario.getRawValue() });

    protected readonly temTexto = computed(() => !!this.arquivo() || !!this.valores().textoColado?.trim());

    protected readonly escolhida = computed(() => this.propostas.proposta(this.valores().propostaId));

    /** Com proposta de mais de uma turma, a turma vira uma lista; com uma só, vem preenchida. */
    protected readonly turmasDaProposta = computed(() => this.escolhida()?.turmas ?? []);

    async ngOnInit(): Promise<void> {
        await this.propostas.carregar();
        const proposta = this.propostas.proposta(this.proposta());

        if (proposta && !proposta.encerrada) {
            this.escolherProposta(proposta.id);
        }

        const aluno = this.aluno();

        if (aluno && this.alunos.aluno(aluno)) {
            this.modo.set('existente');
            this.escolherExistente(aluno);

            if (proposta && !proposta.encerrada && proposta.turmas.length === 1) {
                this.formulario.patchValue({ turma: proposta.turmas[0] });
            }
        }
    }

    protected escolherProposta(id: string): void {
        const proposta = this.propostas.proposta(id);
        this.formulario.patchValue({ propostaId: proposta?.id ?? '' });

        if (proposta?.turmas.length === 1) {
            this.formulario.patchValue({ turma: proposta.turmas[0] });
        } else if (proposta && !proposta.turmas.includes(this.formulario.controls.turma.value)) {
            this.formulario.patchValue({ turma: '' });
        }
    }

    /** Aluno novo (código digitado) ou já acompanhado (escolhido na lista). */
    protected readonly modo = signal<'novo' | 'existente'>('novo');

    protected readonly existentes = computed(() =>
        this.alunos
            .alunos()
            .map((aluno) => ({ ...aluno, rotulo: aluno.codigo }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    );

    protected mudarModo(modo: 'novo' | 'existente'): void {
        this.modo.set(modo);
        this.formulario.controls.aluno.reset('');
    }

    /** Ao escolher um aluno já acompanhado, repete a turma e o perfil dele. */
    protected escolherExistente(codigo: string): void {
        const aluno = this.alunos.aluno(codigo);
        this.formulario.patchValue({ aluno: codigo });

        if (aluno) {
            this.formulario.patchValue({ turma: aluno.turma, perfil: aluno.perfil });
        }
    }

    protected escolherArquivo(evento: Event): void {
        const entrada = evento.target as HTMLInputElement;
        const escolhido = entrada.files?.[0] ?? null;
        entrada.value = '';

        if (!escolhido) {
            return;
        }

        const extensao = escolhido.name.split('.').pop()?.toLowerCase() ?? '';

        if (!EXTENSOES_ACEITAS.includes(extensao)) {
            this.erroArquivo.set('Use um arquivo PDF, TXT ou DOCX.');
            return;
        }

        this.erroArquivo.set(null);
        this.arquivo.set(escolhido);
    }

    protected removerArquivo(): void {
        this.arquivo.set(null);
    }

    protected async enviar(): Promise<void> {
        this.formulario.markAllAsTouched();

        if (this.formulario.invalid || !this.temTexto()) {
            return;
        }

        const { propostaId, ...valores } = this.formulario.getRawValue();
        this.enviando.set(true);
        this.erroEnvio.set(null);

        try {
            const redacao = await this.redacoes.importar({
                ...valores,
                aluno: valores.aluno.trim(),
                origemId: null,
                propostaId: propostaId || null,
                arquivo: this.arquivo(),
            });

            this.avisos.mostrar('Redação importada', { texto: 'Agora peça a correção da IA.' });
            await this.router.navigate(['/redacoes', redacao.id]);
        } catch (erro) {
            this.erroEnvio.set(erro instanceof Error ? erro.message : 'Não foi possível importar a redação.');
        } finally {
            this.enviando.set(false);
        }
    }
}
