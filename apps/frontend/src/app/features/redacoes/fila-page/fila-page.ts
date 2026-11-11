import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { contarDecisoes } from '../../../core/redacoes/analise';
import { Redacao, contarPalavras } from '../../../core/redacoes/redacao.model';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Icone } from '../../../shared/icone/icone';

@Component({
    selector: 'app-fila-page',
    imports: [RouterLink, DatePipe, CabecalhoPagina, Icone],
    templateUrl: './fila-page.html',
    styleUrl: './fila-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilaPage {
    protected readonly redacoes = inject(RedacoesService);

    protected readonly erros = signal<Readonly<Record<string, string>>>({});

    protected readonly contarDecisoes = contarDecisoes;
    protected readonly contarPalavras = contarPalavras;

    protected async corrigir(redacao: Redacao): Promise<void> {
        this.erros.update(({ [redacao.id]: _, ...resto }) => resto);

        try {
            await this.redacoes.corrigirComIa(redacao.id);
        } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : 'A correção falhou. Tente de novo.';
            this.erros.update((atual) => ({ ...atual, [redacao.id]: mensagem }));
        }
    }
}
