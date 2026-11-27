import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
    AlteracaoUsuario,
    TAMANHO_MINIMO_SENHA,
    UsuariosService,
    gerarSenha,
} from '../../../core/admin/usuarios.service';
import { mensagemDeErro } from '../../../core/api/erro-api';
import { DESCRICAO_PERFIL, PERFIS, Perfil, ROTULO_PERFIL, Usuario } from '../../../core/auth/auth.model';
import { ConfirmacaoService } from '../../../core/ui/confirmacao.service';

export interface UsuarioSalvo {
    readonly usuario: Usuario;
    readonly novo: boolean;
    /** Senha definida agora (criação ou redefinição), para o admin repassar. */
    readonly senha: string | null;
}

/** Cria (usuario = null) ou edita um usuário. Faz a chamada à API e emite o resultado. */
@Component({
    selector: 'app-usuario-formulario',
    imports: [ReactiveFormsModule],
    templateUrl: './usuario-formulario.html',
    styleUrl: './usuario-formulario.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioFormulario implements OnInit {
    private readonly usuarios = inject(UsuariosService);
    private readonly confirmacao = inject(ConfirmacaoService);

    readonly usuario = input<Usuario | null>(null);
    /** O admin está editando a si mesmo: não pode rebaixar o perfil nem se desativar. */
    readonly ehVoce = input(false);

    readonly salvo = output<UsuarioSalvo>();
    readonly cancelado = output<void>();

    protected readonly perfis = PERFIS;
    protected readonly rotuloPerfil = ROTULO_PERFIL;
    protected readonly descricaoPerfil = DESCRICAO_PERFIL;
    protected readonly minimoSenha = TAMANHO_MINIMO_SENHA;

    protected readonly novo = computed(() => this.usuario() === null);
    protected readonly trocarSenha = signal(false);
    protected readonly salvando = signal(false);
    protected readonly erro = signal<string | null>(null);

    protected readonly formulario = inject(NonNullableFormBuilder).group({
        nome: ['', [Validators.required, Validators.maxLength(100)]],
        email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
        perfil: ['professor' as Perfil, Validators.required],
        ativo: [true],
        senha: ['', [Validators.required, Validators.minLength(TAMANHO_MINIMO_SENHA)]],
    });

    ngOnInit(): void {
        const usuario = this.usuario();

        if (usuario) {
            this.formulario.patchValue(usuario);
            this.formulario.controls.email.disable();
            this.formulario.controls.senha.disable();

            if (this.ehVoce()) {
                this.formulario.controls.perfil.disable();
                this.formulario.controls.ativo.disable();
            }
        } else {
            this.formulario.controls.ativo.disable();
        }
    }

    protected alternarTrocaSenha(): void {
        const ligar = !this.trocarSenha();
        const senha = this.formulario.controls.senha;
        this.trocarSenha.set(ligar);
        senha.reset('');

        if (ligar) {
            senha.enable();
        } else {
            senha.disable();
        }
    }

    protected gerar(): void {
        this.formulario.controls.senha.setValue(gerarSenha());
        this.formulario.controls.senha.markAsTouched();
    }

    protected async salvar(): Promise<void> {
        this.formulario.markAllAsTouched();

        if (this.formulario.invalid || this.salvando()) {
            return;
        }

        const atual = this.usuario();

        if (
            atual?.ativo &&
            !this.ehVoce() &&
            !this.formulario.getRawValue().ativo &&
            !(await this.confirmacao.confirmar({
                titulo: `Desativar ${atual.nome}?`,
                texto: 'A pessoa não consegue mais entrar e as sessões abertas são encerradas. O histórico é mantido e você pode reativar depois.',
                confirmar: 'Desativar',
                perigo: true,
            }))
        ) {
            return;
        }

        this.salvando.set(true);
        this.erro.set(null);

        try {
            this.salvo.emit(await this.enviar());
        } catch (erro) {
            this.erro.set(mensagemDeErro(erro, 'Não foi possível salvar o usuário.'));
        } finally {
            this.salvando.set(false);
        }
    }

    private async enviar(): Promise<UsuarioSalvo> {
        const valores = this.formulario.getRawValue();
        const nome = valores.nome.trim();
        const atual = this.usuario();

        if (!atual) {
            const usuario = await this.usuarios.criar({
                nome,
                email: valores.email.trim(),
                perfil: valores.perfil,
                senha: valores.senha,
            });

            return { usuario, novo: true, senha: valores.senha };
        }

        // Envia só o que mudou, para a auditoria registrar exatamente a alteração.
        const alteracao: { -readonly [K in keyof AlteracaoUsuario]: AlteracaoUsuario[K] } = {};

        if (nome !== atual.nome) {
            alteracao.nome = nome;
        }
        if (!this.ehVoce() && valores.perfil !== atual.perfil) {
            alteracao.perfil = valores.perfil;
        }
        if (!this.ehVoce() && valores.ativo !== atual.ativo) {
            alteracao.ativo = valores.ativo;
        }
        if (this.trocarSenha()) {
            alteracao.senha = valores.senha;
        }

        if (Object.keys(alteracao).length === 0) {
            return { usuario: atual, novo: false, senha: null };
        }

        const usuario = await this.usuarios.alterar(atual.id, alteracao);

        return { usuario, novo: false, senha: alteracao.senha ?? null };
    }
}
