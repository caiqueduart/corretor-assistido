import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { AreaAlunoService } from '../../core/aluno/area-aluno.service';
import { Icone } from '../../shared/icone/icone';

const EXTENSOES = ['pdf', 'txt', 'docx'];

/** Envio da redação pelo aluno: escrever/colar ou anexar o arquivo. */
@Component({
    selector: 'app-envio-aluno',
    imports: [Icone],
    template: `
        <div class="envio__modos" role="radiogroup" aria-label="Como enviar">
            <button type="button" role="radio" [attr.aria-checked]="modo() === 'texto'" (click)="modo.set('texto')">
                Escrever ou colar
            </button>
            <button type="button" role="radio" [attr.aria-checked]="modo() === 'arquivo'" (click)="modo.set('arquivo')">
                Anexar arquivo
            </button>
        </div>

        @if (modo() === 'texto') {
            <label class="visualmente-oculto" [for]="'texto-' + propostaId()">Sua redação</label>
            <textarea
                class="envio__texto"
                [id]="'texto-' + propostaId()"
                rows="10"
                placeholder="Escreva ou cole aqui a sua redação."
                [value]="texto()"
                (input)="texto.set($any($event.target).value)"
            ></textarea>
        } @else {
            <label class="envio__arquivo">
                <app-icone nome="importar" />
                <span>{{ arquivo()?.name ?? 'Escolher arquivo (PDF, TXT ou DOCX)' }}</span>
                <input class="visualmente-oculto" type="file" accept=".pdf,.txt,.docx" (change)="escolher($event)" />
            </label>
        }

        @if (erro(); as mensagem) {
            <p class="aviso aviso--erro" role="alert">{{ mensagem }}</p>
        }

        <div class="envio__acoes">
            <button class="botao botao--discreto" type="button" (click)="cancelado.emit()">Cancelar</button>
            <button class="botao botao--primario" type="button" [disabled]="enviando()" (click)="enviar()">
                <app-icone nome="enviar" />
                {{ enviando() ? 'Enviando…' : reenvio() ? 'Trocar o texto' : 'Enviar redação' }}
            </button>
        </div>
    `,
    styles: `
        :host {
            display: grid;
            gap: var(--space-3);
        }

        .envio__modos {
            display: inline-flex;
            justify-self: start;
            gap: 2px;
            padding: 3px;
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            background: var(--surface-muted);

            button {
                height: 2rem;
                padding: 0 var(--space-3);
                border: 0;
                border-radius: var(--radius-md);
                background: transparent;
                color: var(--text-muted);
                font-size: var(--text-sm);
                font-weight: var(--weight-medium);

                &[aria-checked='true'] {
                    background: var(--surface);
                    color: var(--text);
                    box-shadow: var(--shadow-sm);
                }
            }
        }

        .envio__texto {
            width: 100%;
            padding: var(--space-3);
            border: 1px solid var(--border-strong);
            border-radius: var(--radius-md);
            font-family: var(--fonte-texto);
            font-size: var(--text-md);
            line-height: 1.6;
            resize: vertical;

            &:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent);
            }
        }

        .envio__arquivo {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-6) var(--space-4);
            border: 1px dashed var(--border-strong);
            border-radius: var(--radius-lg);
            background: var(--surface-muted);
            color: var(--text-muted);
            cursor: pointer;

            &:hover {
                border-color: var(--primary);
                color: var(--primary);
            }
        }

        .envio__acoes {
            display: flex;
            justify-content: flex-end;
            gap: var(--space-2);
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvioAluno {
    private readonly area = inject(AreaAlunoService);

    readonly propostaId = input.required<string>();
    readonly reenvio = input(false);
    readonly enviado = output<boolean>();
    readonly cancelado = output<void>();

    protected readonly modo = signal<'texto' | 'arquivo'>('texto');
    protected readonly texto = signal('');
    protected readonly arquivo = signal<File | null>(null);
    protected readonly enviando = signal(false);
    protected readonly erro = signal<string | null>(null);

    protected escolher(evento: Event): void {
        const entrada = evento.target as HTMLInputElement;
        const escolhido = entrada.files?.[0] ?? null;
        entrada.value = '';

        if (escolhido && !EXTENSOES.includes(escolhido.name.split('.').pop()?.toLowerCase() ?? '')) {
            this.erro.set('Use um arquivo PDF, TXT ou DOCX.');
            return;
        }

        this.erro.set(null);
        this.arquivo.set(escolhido);
    }

    protected async enviar(): Promise<void> {
        const arquivo = this.arquivo();

        if (this.modo() === 'texto' ? !this.texto().trim() : !arquivo) {
            this.erro.set(this.modo() === 'texto' ? 'Escreva ou cole a sua redação.' : 'Escolha o arquivo da redação.');
            return;
        }

        this.enviando.set(true);
        this.erro.set(null);

        try {
            const reenvio =
                this.modo() === 'texto'
                    ? await this.area.enviarTexto(this.propostaId(), this.texto())
                    : await this.area.enviarArquivo(this.propostaId(), arquivo!);
            this.enviado.emit(reenvio);
        } catch (erro) {
            this.erro.set(erro instanceof Error ? erro.message : 'Não foi possível enviar.');
        } finally {
            this.enviando.set(false);
        }
    }
}
