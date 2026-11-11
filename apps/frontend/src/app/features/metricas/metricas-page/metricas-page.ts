import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LIMIAR_ALERTA_VIES, MetricasService } from '../../../core/redacoes/metricas.service';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Icone } from '../../../shared/icone/icone';

@Component({
    selector: 'app-metricas-page',
    imports: [DecimalPipe, CabecalhoPagina, Icone],
    templateUrl: './metricas-page.html',
    styleUrl: './metricas-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricasPage {
    protected readonly redacoes = inject(RedacoesService);
    protected readonly metricas = inject(MetricasService);

    protected readonly limiar = LIMIAR_ALERTA_VIES;

    protected porcentagem(parte: number, total: number): number {
        return total ? (100 * parte) / total : 0;
    }
}
