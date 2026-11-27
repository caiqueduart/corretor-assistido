import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AlunosService } from '../../../core/redacoes/alunos.service';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { SituacaoVersao } from '../situacao-versao/situacao-versao';
import { Esqueleto } from '../../../shared/esqueleto/esqueleto';

@Component({
    selector: 'app-alunos-page',
    imports: [RouterLink, CabecalhoPagina, SituacaoVersao, Esqueleto],
    templateUrl: './alunos-page.html',
    styleUrl: './alunos-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlunosPage {
    protected readonly redacoes = inject(RedacoesService);
    protected readonly alunos = inject(AlunosService).alunos;
}
