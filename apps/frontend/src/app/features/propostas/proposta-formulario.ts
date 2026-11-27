import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Proposta, PropostasService } from '../../core/propostas/propostas.service';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { Icone } from '../../shared/icone/icone';

const MAXIMO_TURMAS = 10;

/** Cria (proposta = null) ou edita uma proposta de redação. */
@Component({
    selector: 'app-proposta-formulario',
    imports: [ReactiveFormsModule, Icone],
    templateUrl: './proposta-formulario.html',
    styleUrl: './proposta-formulario.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropostaFormulario implements OnInit {
    private readonly propostas = inject(PropostasService);
    private readonly redacoes = inject(RedacoesService);

    readonly proposta = input<Proposta | null>(null);
    readonly salvo = output<Proposta>();
    readonly cancelado = output<void>();

    protected readonly generos = this.propostas.generos;
    protected readonly nova = computed(() => this.proposta() === null);
    protected readonly turmas = signal<string[]>([]);
    protected readonly turmaDigitada = signal('');
    protected readonly salvando = signal(false);
    protected readonly erro = signal<string | null>(null);
    protected readonly tentou = signal(false);

    /** Turmas que já aparecem nas redações, como sugestão. */
    protected readonly sugestoes = computed(() =>
        [
            ...new Set(
                this.redacoes
                    .redacoes()
                    .map((r) => r.turma)
                    .filter(Boolean),
            ),
        ]
            .filter((t) => !this.turmas().includes(t))
            .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );

    protected readonly formulario = inject(NonNullableFormBuilder).group({
        tema: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
        genero: ['Dissertativo-argumentativo', Validators.required],
        enunciado: ['', Validators.maxLength(4000)],
        prazo: [''],
    });

    ngOnInit(): void {
        const atual = this.proposta();

        if (atual) {
            this.formulario.setValue({
                tema: atual.tema,
                genero: atual.genero,
                enunciado: atual.enunciado,
                prazo: atual.prazo ?? '',
            });
            this.turmas.set([...atual.turmas]);
        }
    }

    protected teclarTurma(evento: KeyboardEvent): void {
        if (evento.key === 'Enter' || evento.key === ',') {
            evento.preventDefault();
            this.adicionarTurma();
        } else if (evento.key === 'Backspace' && !this.turmaDigitada() && this.turmas().length) {
            this.turmas.update((lista) => lista.slice(0, -1));
        }
    }

    protected adicionarTurma(valor = this.turmaDigitada()): void {
        const turma = valor.trim().slice(0, 30);

        if (turma && !this.turmas().includes(turma) && this.turmas().length < MAXIMO_TURMAS) {
            this.turmas.update((lista) => [...lista, turma]);
        }

        this.turmaDigitada.set('');
    }

    protected removerTurma(turma: string): void {
        this.turmas.update((lista) => lista.filter((t) => t !== turma));
    }

    protected async salvar(): Promise<void> {
        this.tentou.set(true);
        this.formulario.markAllAsTouched();

        if (this.turmaDigitada().trim()) {
            this.adicionarTurma();
        }

        if (this.formulario.invalid || !this.turmas().length || this.salvando()) {
            return;
        }

        const valores = this.formulario.getRawValue();
        const dados = {
            tema: valores.tema.trim(),
            genero: valores.genero,
            enunciado: valores.enunciado.trim(),
            turmas: this.turmas(),
            prazo: valores.prazo || null,
        };
        const atual = this.proposta();
        this.salvando.set(true);
        this.erro.set(null);

        try {
            this.salvo.emit(atual ? await this.propostas.alterar(atual.id, dados) : await this.propostas.criar(dados));
        } catch (erro) {
            this.erro.set(erro instanceof Error ? erro.message : 'Não foi possível salvar a proposta.');
        } finally {
            this.salvando.set(false);
        }
    }
}
