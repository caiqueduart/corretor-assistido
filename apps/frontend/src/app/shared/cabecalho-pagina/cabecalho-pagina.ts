import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Título da página, descrição curta e ações à direita (via conteúdo projetado). */
@Component({
    selector: 'app-cabecalho-pagina',
    template: `
        <div class="cabecalho__textos">
            <h1 class="cabecalho__titulo">{{ titulo() }}</h1>

            @if (descricao()) {
                <p class="cabecalho__descricao">{{ descricao() }}</p>
            }
        </div>

        <div class="cabecalho__acoes">
            <ng-content />
        </div>
    `,
    styleUrl: './cabecalho-pagina.scss',
    host: { class: 'cabecalho' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabecalhoPagina {
    readonly titulo = input.required<string>();
    readonly descricao = input<string>();
}
