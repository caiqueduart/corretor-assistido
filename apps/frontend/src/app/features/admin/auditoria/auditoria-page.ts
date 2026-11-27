import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';

import {
    AuditoriaService,
    LIMITES_AUDITORIA,
    RegistroAuditoria,
    descreverAlvo,
    descreverDetalhe,
    rotuloAcao,
} from '../../../core/admin/auditoria.service';
import { UsuariosService } from '../../../core/admin/usuarios.service';
import { mensagemDeErro } from '../../../core/api/erro-api';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';

interface LinhaAuditoria {
    readonly id: number;
    readonly criadoEm: string;
    readonly autor: string;
    readonly acao: string;
    readonly rotulo: string;
    readonly alvo: string;
    readonly detalhe: string;
    readonly usuarioId: string | null;
}

/** Início do dia local de uma data `yyyy-mm-dd` (campo de data), em ms. */
function inicioDoDia(data: string): number {
    const [ano, mes, dia] = data.split('-').map(Number);

    return new Date(ano, mes - 1, dia).getTime();
}

const UM_DIA = 86_400_000;

@Component({
    selector: 'app-auditoria-page',
    imports: [DatePipe, CabecalhoPagina],
    templateUrl: './auditoria-page.html',
    styleUrl: './auditoria-page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditoriaPage implements OnInit {
    private readonly auditoria = inject(AuditoriaService);
    private readonly usuarios = inject(UsuariosService);

    protected readonly limites = LIMITES_AUDITORIA;

    protected readonly registros = signal<RegistroAuditoria[]>([]);
    private readonly nomes = signal<ReadonlyMap<string, string>>(new Map());
    protected readonly carregando = signal(true);
    protected readonly erro = signal<string | null>(null);

    protected readonly limite = signal<number>(LIMITES_AUDITORIA[0]);
    protected readonly filtroAcao = signal('');
    protected readonly filtroUsuario = signal('');
    protected readonly de = signal('');
    protected readonly ate = signal('');

    protected readonly linhas = computed<LinhaAuditoria[]>(() => {
        const nomes = this.nomes();

        return this.registros().map((r) => ({
            id: r.id,
            criadoEm: r.criadoEm,
            autor: r.usuarioId ? (nomes.get(r.usuarioId) ?? 'Usuário removido') : 'Sistema',
            acao: r.acao,
            rotulo: rotuloAcao(r.acao),
            alvo: descreverAlvo(r, nomes),
            detalhe: descreverDetalhe(r),
            usuarioId: r.usuarioId,
        }));
    });

    /** Opções dos filtros, a partir do que aparece nos registros carregados. */
    protected readonly acoes = computed(() =>
        [...new Map(this.linhas().map((l) => [l.acao, l.rotulo]))]
            .map(([valor, rotulo]) => ({ valor, rotulo }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    );

    protected readonly autores = computed(() =>
        [...new Map(this.linhas().map((l) => [l.usuarioId ?? '', l.autor]))]
            .map(([valor, rotulo]) => ({ valor, rotulo }))
            .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    );

    protected readonly filtradas = computed(() => {
        const acao = this.filtroAcao();
        const usuario = this.filtroUsuario();
        const desde = this.de() ? inicioDoDia(this.de()) : -Infinity;
        const ate = this.ate() ? inicioDoDia(this.ate()) + UM_DIA : Infinity;

        return this.linhas().filter((l) => {
            const quando = Date.parse(l.criadoEm);

            return (
                (!acao || l.acao === acao) &&
                (!usuario || (l.usuarioId ?? '') === usuario) &&
                quando >= desde &&
                quando < ate
            );
        });
    });

    protected readonly temFiltro = computed(
        () => !!(this.filtroAcao() || this.filtroUsuario() || this.de() || this.ate()),
    );

    /** Chegou ao limite: pode haver registros mais antigos não carregados. */
    protected readonly truncado = computed(() => this.registros().length >= this.limite());

    ngOnInit(): void {
        void this.carregar();
        void this.carregarNomes();
    }

    protected async carregar(): Promise<void> {
        this.carregando.set(true);
        this.erro.set(null);

        try {
            this.registros.set(await this.auditoria.listar(this.limite()));
        } catch (erro) {
            this.erro.set(mensagemDeErro(erro, 'Não foi possível carregar a auditoria.'));
        } finally {
            this.carregando.set(false);
        }
    }

    protected mudarLimite(valor: string): void {
        this.limite.set(Number(valor));
        void this.carregar();
    }

    protected limparFiltros(): void {
        this.filtroAcao.set('');
        this.filtroUsuario.set('');
        this.de.set('');
        this.ate.set('');
    }

    private async carregarNomes(): Promise<void> {
        try {
            const lista = await this.usuarios.listar();
            this.nomes.set(new Map(lista.map((u) => [u.id, u.nome])));
        } catch {
            // Sem a lista, os autores aparecem como "Usuário removido".
        }
    }
}
