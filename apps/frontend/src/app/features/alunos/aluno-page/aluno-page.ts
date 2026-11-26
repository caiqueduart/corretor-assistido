import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AlunosService } from '../../../core/redacoes/alunos.service';
import { RedacoesService } from '../../../core/redacoes/redacoes.service';
import { Icone } from '../../../shared/icone/icone';
import { SituacaoVersao } from '../situacao-versao/situacao-versao';

@Component({
    selector: 'app-aluno-page',
    imports: [RouterLink, Icone, SituacaoVersao],
    templateUrl: './aluno-page.html',
    styleUrl: './aluno-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlunoPage {
    protected readonly redacoes = inject(RedacoesService);
    private readonly alunos = inject(AlunosService);

    /** Vem do parâmetro `:codigo` da rota. */
    readonly codigo = input.required<string>();

    protected readonly aluno = computed(() => this.alunos.alunos().find((aluno) => aluno.codigo === this.codigo()));
}
