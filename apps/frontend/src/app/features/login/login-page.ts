import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { mensagemDeErro } from '../../core/api/erro-api';
import { AuthService } from '../../core/auth/auth.service';
import { destinoSeguro } from '../../core/auth/guards';
import { Icone } from '../../shared/icone/icone';

@Component({
    selector: 'app-login-page',
    imports: [ReactiveFormsModule, Icone],
    templateUrl: './login-page.html',
    styleUrl: './login-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    /** Query params preenchidos pelo roteador (withComponentInputBinding). */
    readonly voltar = input<string>();
    readonly expirada = input<string>();

    protected readonly formulario = inject(NonNullableFormBuilder).group({
        email: ['', [Validators.required, Validators.email]],
        senha: ['', Validators.required],
    });

    protected readonly entrando = signal(false);
    protected readonly erro = signal<string | null>(null);
    protected readonly senhaVisivel = signal(false);

    protected async entrar(): Promise<void> {
        this.formulario.markAllAsTouched();

        if (this.formulario.invalid || this.entrando()) {
            return;
        }

        const { email, senha } = this.formulario.getRawValue();
        this.entrando.set(true);
        this.erro.set(null);

        try {
            await this.auth.login(email.trim(), senha);
            await this.router.navigateByUrl(destinoSeguro(this.voltar()));
        } catch (erro) {
            this.erro.set(mensagemDeErro(erro, 'Não foi possível entrar. Tente de novo.'));
            this.formulario.controls.senha.reset();
        } finally {
            this.entrando.set(false);
        }
    }
}
