import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ConfigService, GRUPO_NAO_INFORMADO } from '../../../core/admin/config.service';
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

    /** Perfis definidos pelo admin em Administração › Configuração. */
    protected readonly perfis = inject(ConfigService).grupos;

    protected readonly formulario = inject(NonNullableFormBuilder).group({
        aluno: ['', [Validators.required, Validators.pattern(/^[\w-]{2,12}$/)]],
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

        const valores = this.formulario.getRawValue();
        this.enviando.set(true);
        this.erroEnvio.set(null);

        try {
            const redacao = await this.redacoes.importar({
                ...valores,
                origemId: null,
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
