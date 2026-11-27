import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ConfigService, GRUPO_NAO_INFORMADO } from '../../../core/admin/config.service';
import { gerarApelido } from '../../../core/alunos/apelidos';
import { ChamadaService } from '../../../core/alunos/chamada.service';
import { AlunosService } from '../../../core/redacoes/alunos.service';
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
export class ImportarPage {
    private readonly redacoes = inject(RedacoesService);
    private readonly router = inject(Router);
    private readonly avisos = inject(AvisosService);
    private readonly alunos = inject(AlunosService);
    protected readonly chamada = inject(ChamadaService);

    /** Perfis definidos pelo admin em Administração › Configuração. */
    protected readonly perfis = inject(ConfigService).grupos;

    protected readonly formulario = inject(NonNullableFormBuilder).group({
        /** Identificador enviado ao servidor: apelido (aluno novo) ou o já existente. Nunca o nome. */
        aluno: ['', Validators.required],
        /** Nome real do aluno novo: fica só neste computador (lista de chamada local). */
        nomeLocal: ['', Validators.maxLength(80)],
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

    /** Aluno novo (apelido sorteado) ou já acompanhado (escolhido na lista). */
    protected readonly modo = signal<'novo' | 'existente'>('novo');

    protected readonly existentes = computed(() =>
        this.alunos
            .alunos()
            .map((aluno) => ({ ...aluno, rotulo: this.chamada.rotulo(aluno.codigo) }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    );

    constructor() {
        this.sortear();
    }

    protected mudarModo(modo: 'novo' | 'existente'): void {
        this.modo.set(modo);
        this.formulario.controls.nomeLocal.reset('');

        if (modo === 'novo') {
            this.sortear();
        } else {
            this.formulario.controls.aluno.reset('');
        }
    }

    /** Sorteia um apelido que nenhum aluno usa ainda. */
    protected sortear(): void {
        this.formulario.controls.aluno.setValue(gerarApelido(this.alunos.alunos().map((aluno) => aluno.codigo)));
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

        const { nomeLocal, ...valores } = this.formulario.getRawValue();
        this.enviando.set(true);
        this.erroEnvio.set(null);

        try {
            const redacao = await this.redacoes.importar({
                ...valores,
                origemId: null,
                arquivo: this.arquivo(),
            });

            if (this.modo() === 'novo' && nomeLocal.trim()) {
                this.chamada.definir(redacao.aluno, nomeLocal);
            }

            this.avisos.mostrar('Redação importada', { texto: 'Agora peça a correção da IA.' });
            await this.router.navigate(['/redacoes', redacao.id]);
        } catch (erro) {
            this.erroEnvio.set(erro instanceof Error ? erro.message : 'Não foi possível importar a redação.');
        } finally {
            this.enviando.set(false);
        }
    }
}
