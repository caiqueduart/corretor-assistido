import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
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

    private readonly auth = inject(AuthService);

    protected readonly erros = signal<Readonly<Record<string, string>>>({});
    protected readonly carregandoExemplos = signal(false);
    protected readonly erroExemplos = signal<string | null>(null);

    /** O perfil leitura só consulta. */
    protected readonly podeEditar = computed(() => this.auth.temPerfil('admin', 'professor'));

    protected readonly contarDecisoes = contarDecisoes;
    protected readonly contarPalavras = contarPalavras;

    protected async carregarExemplos(): Promise<void> {
        this.carregandoExemplos.set(true);
        this.erroExemplos.set(null);

        try {
            await this.redacoes.carregarExemplos();
        } catch (erro) {
            this.erroExemplos.set(erro instanceof Error ? erro.message : 'Não foi possível carregar os exemplos.');
        } finally {
            this.carregandoExemplos.set(false);
        }
    }

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
