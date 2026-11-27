import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AreaAlunoService, DevolutivaAluno, PropostaAluno } from '../../core/aluno/area-aluno.service';
import { descreverPrazo } from '../../core/propostas/propostas.service';
import { Icone } from '../../shared/icone/icone';
import { EnvioAluno } from './envio-aluno';

/** Área do aluno (sem login): entra com o código, envia redações e vê devolutivas. */
@Component({
    selector: 'app-area-aluno-page',
    imports: [RouterLink, Icone, EnvioAluno],
    templateUrl: './area-aluno-page.html',
    styleUrl: './area-aluno-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaAlunoPage implements OnInit {
    protected readonly area = inject(AreaAlunoService);
    protected readonly descreverPrazo = descreverPrazo;

    protected readonly codigoDigitado = signal('');
    protected readonly entrando = signal(false);
    protected readonly erro = signal<string | null>(null);
    protected readonly confirmacao = signal<string | null>(null);

    /** Proposta com o formulário de envio aberto. */
    protected readonly enviandoPara = signal<string | null>(null);
    protected readonly devolutiva = signal<DevolutivaAluno | null>(null);
    protected readonly carregandoDevolutiva = signal(false);

    async ngOnInit(): Promise<void> {
        // Volta ao painel se a aba ainda guarda o código.
        if (this.area.codigo() && !this.area.painel()) {
            try {
                await this.area.atualizar();
            } catch {
                this.area.sair();
            }
        }
    }

    /** Formata enquanto digita: ABCD-EFGH. */
    protected digitar(valor: string): void {
        const limpo = valor
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 8);
        this.codigoDigitado.set(limpo.length > 4 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo);
    }

    protected async entrar(): Promise<void> {
        if (this.codigoDigitado().replace('-', '').length < 8 || this.entrando()) {
            this.erro.set('O código tem 8 letras e números, como ABCD-EFGH.');
            return;
        }

        this.entrando.set(true);
        this.erro.set(null);

        try {
            await this.area.entrar(this.codigoDigitado());
        } catch (erro) {
            this.erro.set(erro instanceof Error ? erro.message : 'Não foi possível entrar.');
        } finally {
            this.entrando.set(false);
        }
    }

    protected sair(): void {
        this.area.sair();
        this.codigoDigitado.set('');
        this.devolutiva.set(null);
        this.enviandoPara.set(null);
        this.confirmacao.set(null);
    }

    protected situacao(proposta: PropostaAluno): string {
        switch (proposta.entrega?.status) {
            case undefined:
                return 'Ainda não enviada';
            case 'pendente':
                return 'Enviada · você ainda pode trocar o texto';
            case 'concluido':
                return 'Devolutiva pronta';
            default:
                return 'Em correção pelo professor';
        }
    }

    protected async aoEnviar(reenvio: boolean): Promise<void> {
        this.enviandoPara.set(null);
        this.confirmacao.set(
            reenvio ? 'Pronto! O texto foi trocado.' : 'Pronto! Sua redação foi enviada ao professor.',
        );
        await this.area.atualizar();
    }

    protected async abrirDevolutiva(textoId: string): Promise<void> {
        this.carregandoDevolutiva.set(true);
        this.erro.set(null);

        try {
            this.devolutiva.set(await this.area.devolutiva(textoId));
            window.scrollTo({ top: 0 });
        } catch (erro) {
            this.erro.set(erro instanceof Error ? erro.message : 'Não foi possível abrir a devolutiva.');
        } finally {
            this.carregandoDevolutiva.set(false);
        }
    }
}
