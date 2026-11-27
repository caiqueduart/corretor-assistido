import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChamadaService } from '../../../core/alunos/chamada.service';
import { AlunosService } from '../../../core/redacoes/alunos.service';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { ConfirmacaoService } from '../../../core/ui/confirmacao.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Esqueleto } from '../../../shared/esqueleto/esqueleto';
import { Icone } from '../../../shared/icone/icone';
import { SituacaoVersao } from '../situacao-versao/situacao-versao';

@Component({
    selector: 'app-alunos-page',
    imports: [RouterLink, CabecalhoPagina, SituacaoVersao, Esqueleto, Icone],
    templateUrl: './alunos-page.html',
    styleUrl: './alunos-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlunosPage {
    protected readonly redacoes = inject(RedacoesService);
    protected readonly alunos = inject(AlunosService).alunos;
    protected readonly chamada = inject(ChamadaService);
    private readonly avisos = inject(AvisosService);
    private readonly confirmacao = inject(ConfirmacaoService);

    /** Aluno com o nome em edição na tabela. */
    protected readonly editando = signal<string | null>(null);

    protected salvarNome(codigo: string, nome: string): void {
        this.chamada.definir(codigo, nome);
        this.editando.set(null);
    }

    protected exportar(): void {
        const arquivo = new Blob([this.chamada.exportar()], { type: 'application/json' });
        const url = URL.createObjectURL(arquivo);
        const link = Object.assign(document.createElement('a'), { href: url, download: 'lista-de-chamada.json' });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        this.avisos.mostrar('Lista de chamada exportada', {
            texto: 'Guarde o arquivo em lugar seguro: ele tem os nomes dos alunos.',
        });
    }

    protected async importar(evento: Event): Promise<void> {
        const entrada = evento.target as HTMLInputElement;
        const arquivo = entrada.files?.[0];
        entrada.value = '';

        if (!arquivo) {
            return;
        }

        try {
            const n = this.chamada.importar(await arquivo.text());
            this.avisos.mostrar('Lista de chamada importada', {
                texto: `${n} ${n === 1 ? 'nome' : 'nomes'} neste computador.`,
            });
        } catch (erro) {
            this.avisos.mostrar('Não foi possível importar', {
                tipo: 'erro',
                texto: erro instanceof Error ? erro.message : 'Arquivo inválido.',
            });
        }
    }

    protected async esquecer(): Promise<void> {
        const sim = await this.confirmacao.confirmar({
            titulo: 'Apagar os nomes deste computador?',
            texto: 'Os alunos voltam a aparecer só pelo apelido. Exporte antes se quiser guardar a lista.',
            confirmar: 'Apagar nomes',
            perigo: true,
        });

        if (sim) {
            this.chamada.esquecer();
            this.avisos.mostrar('Nomes apagados deste computador');
        }
    }
}
