import { ChangeDetectionStrategy, Component, isDevMode, output, signal } from '@angular/core';

import { Perfil, ROTULO_PERFIL } from '../../core/auth/auth.model';
import { Icone, NomeIcone } from '../../shared/icone/icone';
import { CONTAS_DEMO, ContaDemo } from './contas-demo';

const ICONE_PERFIL: Readonly<Record<Perfil, NomeIcone>> = { admin: 'escudo', professor: 'lapis', leitura: 'olho' };

/**
 * Atalho do login para as contas de teste: ao escolher um perfil, o login
 * preenche e-mail e senha. Só aparece em desenvolvimento, nunca no build de produção.
 */
@Component({
    selector: 'app-acesso-rapido',
    imports: [Icone],
    templateUrl: './acesso-rapido.html',
    styleUrl: './acesso-rapido.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcessoRapido {
    readonly escolher = output<ContaDemo>();

    protected readonly contas = isDevMode() ? CONTAS_DEMO : [];
    protected readonly escolhida = signal<Perfil | null>(null);
    protected readonly rotuloPerfil = ROTULO_PERFIL;
    protected readonly iconePerfil = ICONE_PERFIL;
}
