import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { HttpErrorResponse } from '@angular/common/http';
import { mensagemDeErro } from '../../../core/api/erro-api';
import { COLUNAS_DECISOES, DecisoesCsvService } from '../../../core/metricas/decisoes-csv.service';
import { Icone } from '../../../shared/icone/icone';
import { AvisosService } from '../../../core/ui/avisos.service';

/** Exporta as decisões do professor (CSV) para a análise da experimentação. */
@Component({
    selector: 'app-exportar-decisoes',
    imports: [Icone],
    templateUrl: './exportar-decisoes.html',
    styleUrl: './exportar-decisoes.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportarDecisoes {
    private readonly decisoes = inject(DecisoesCsvService);
    private readonly avisos = inject(AvisosService);

    protected readonly colunas = COLUNAS_DECISOES.join(', ');
    protected readonly turma = signal('');
    protected readonly baixando = signal(false);
    protected readonly erro = signal<string | null>(null);
    protected readonly concluido = signal(false);

    protected async exportar(): Promise<void> {
        if (this.baixando()) {
            return;
        }

        this.baixando.set(true);
        this.erro.set(null);
        this.concluido.set(false);

        try {
            await this.decisoes.baixar(this.turma());
            this.concluido.set(true);
            this.avisos.mostrar('Decisões exportadas', { texto: 'O arquivo CSV foi baixado.' });
        } catch (erro) {
            this.erro.set(await mensagemDeErroBlob(erro));
        } finally {
            this.baixando.set(false);
        }
    }
}

/** Com `responseType: 'blob'`, o corpo do erro também chega como Blob; lê o JSON antes. */
async function mensagemDeErroBlob(erro: unknown): Promise<string> {
    const padrao = 'Não foi possível exportar as decisões.';

    if (erro instanceof HttpErrorResponse && erro.error instanceof Blob) {
        try {
            const corpo: unknown = JSON.parse(await erro.error.text());

            return mensagemDeErro(new HttpErrorResponse({ status: erro.status, error: corpo }), padrao);
        } catch {
            return mensagemDeErro(new HttpErrorResponse({ status: erro.status }), padrao);
        }
    }

    return mensagemDeErro(erro, padrao);
}
