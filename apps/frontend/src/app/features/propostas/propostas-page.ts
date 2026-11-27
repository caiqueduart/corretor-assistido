import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { progressoDe, progressoPorProposta } from '../../core/propostas/progresso';
import { Proposta, PropostasService, descreverPrazo, diasAtePrazo } from '../../core/propostas/propostas.service';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { normalizar } from '../../layout/busca-rapida/busca';
import { CabecalhoPagina } from '../../shared/cabecalho-pagina/cabecalho-pagina';
import { Esqueleto } from '../../shared/esqueleto/esqueleto';
import { EstadoVazio } from '../../shared/estado-vazio/estado-vazio';
import { Icone } from '../../shared/icone/icone';
import { PropostaFormulario } from './proposta-formulario';

type Aba = 'abertas' | 'encerradas';

/** Situação do prazo para a etiqueta: em dia, perto de vencer ou vencido. */
export function tomPrazo(prazo: string | null): 'ok' | 'perto' | 'vencido' | null {
    const dias = diasAtePrazo(prazo);

    return dias === null ? null : dias < 0 ? 'vencido' : dias <= 3 ? 'perto' : 'ok';
}

@Component({
    selector: 'app-propostas-page',
    imports: [RouterLink, CabecalhoPagina, Esqueleto, EstadoVazio, Icone, PropostaFormulario],
    templateUrl: './propostas-page.html',
    styleUrl: './propostas-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropostasPage {
    protected readonly propostas = inject(PropostasService);
    private readonly redacoes = inject(RedacoesService);
    private readonly auth = inject(AuthService);
    private readonly avisos = inject(AvisosService);
    private readonly router = inject(Router);

    protected readonly descreverPrazo = descreverPrazo;
    protected readonly tomPrazo = tomPrazo;
    protected readonly podeEditar = computed(() => this.auth.temPerfil('admin', 'professor'));

    protected readonly aba = signal<Aba>('abertas');
    protected readonly busca = signal('');
    protected readonly criando = signal(false);
    private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');

    private readonly progresso = computed(() => progressoPorProposta(this.redacoes.redacoes()));

    protected readonly contagem = computed(() => ({
        abertas: this.propostas.propostas().filter((p) => !p.encerrada).length,
        encerradas: this.propostas.propostas().filter((p) => p.encerrada).length,
    }));

    protected readonly cartoes = computed(() => {
        const termo = normalizar(this.busca());
        const encerradas = this.aba() === 'encerradas';

        return this.propostas
            .propostas()
            .filter((p) => p.encerrada === encerradas)
            .filter((p) => !termo || normalizar(`${p.tema} ${p.genero} ${p.turmas.join(' ')}`).includes(termo))
            .sort(
                (a, b) => (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') || b.criadoEm.localeCompare(a.criadoEm),
            )
            .map((proposta) => {
                const progresso = progressoDe(this.progresso(), proposta.id);

                return {
                    proposta,
                    progresso,
                    porcentagem: progresso.total ? (100 * progresso.devolvidas) / progresso.total : 0,
                };
            });
    });

    constructor() {
        effect(() => {
            const dialogo = this.dialogo()?.nativeElement;

            if (dialogo && this.criando() && !dialogo.open) {
                dialogo.showModal();
            } else if (dialogo && !this.criando() && dialogo.open) {
                dialogo.close();
            }
        });
    }

    protected async aoCriar(proposta: Proposta): Promise<void> {
        this.criando.set(false);
        this.avisos.mostrar('Proposta criada', { texto: 'Agora importe as redações dos alunos.' });
        await this.router.navigate(['/propostas', proposta.id]);
    }
}
