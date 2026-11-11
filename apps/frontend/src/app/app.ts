import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { RedacoesService } from './core/redacoes/redacoes.service';
import { Icone, NomeIcone } from './shared/icone/icone';

interface ItemNavegacao {
    readonly rota: string;
    readonly rotulo: string;
    readonly icone: NomeIcone;
}

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone],
    templateUrl: './app.html',
    styleUrl: './app.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
    protected readonly redacoes = inject(RedacoesService);

    protected readonly navegacao: readonly ItemNavegacao[] = [
        { rota: '/redacoes', rotulo: 'Redações', icone: 'redacoes' },
        { rota: '/alunos', rotulo: 'Alunos', icone: 'alunos' },
        { rota: '/metricas', rotulo: 'Métricas', icone: 'metricas' },
    ];

    constructor() {
        void this.redacoes.carregar();
    }
}
