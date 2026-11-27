import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';

import {
    CRITERIOS_DA_POC,
    ConfigService,
    EstadoConfiguracao,
    GRUPO_NAO_INFORMADO,
    LIMITES_CONFIG,
    validarGrupos,
} from '../../../core/admin/config.service';
import { UsuariosService } from '../../../core/admin/usuarios.service';
import { mensagemDeErro } from '../../../core/api/erro-api';
import { CabecalhoPagina } from '../../../shared/cabecalho-pagina/cabecalho-pagina';
import { Icone } from '../../../shared/icone/icone';
import { AvisosService } from '../../../core/ui/avisos.service';
import { ConfirmacaoService } from '../../../core/ui/confirmacao.service';

interface Rascunho {
    readonly criterios: readonly string[];
    readonly grupos: readonly string[];
    readonly limiar: number;
}

function rascunhoDe(estado: EstadoConfiguracao): Rascunho {
    const c = estado.configuracao;

    return {
        criterios: c.criterios,
        grupos: c.grupos.filter((g) => g !== GRUPO_NAO_INFORMADO),
        limiar: c.limiarVies,
    };
}

@Component({
    selector: 'app-configuracao-page',
    imports: [DatePipe, CabecalhoPagina, Icone],
    templateUrl: './configuracao-page.html',
    styleUrl: './configuracao-page.scss',
    host: { '(window:beforeunload)': 'avisarAoSair($event)' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracaoPage implements OnInit {
    private readonly config = inject(ConfigService);
    private readonly usuarios = inject(UsuariosService);
    private readonly avisos = inject(AvisosService);
    private readonly confirmacao = inject(ConfirmacaoService);

    protected readonly grupoPadrao = GRUPO_NAO_INFORMADO;
    protected readonly limites = LIMITES_CONFIG;

    protected readonly estado = signal<EstadoConfiguracao | null>(null);
    protected readonly rascunho = signal<Rascunho>({ criterios: [], grupos: [], limiar: 15 });
    protected readonly carregando = signal(true);
    protected readonly salvando = signal(false);
    protected readonly erroCarga = signal<string | null>(null);
    protected readonly erroSalvar = signal<string | null>(null);
    protected readonly salvoAgora = signal(false);
    protected readonly tentouSalvar = signal(false);
    protected readonly novoGrupo = signal('');
    private readonly nomes = signal<ReadonlyMap<string, string>>(new Map());

    protected readonly criterios = computed(() =>
        (this.estado()?.criteriosDisponiveis ?? []).map((c) => ({
            ...c,
            daPoc: CRITERIOS_DA_POC.includes(c.id),
            marcado: this.rascunho().criterios.includes(c.id),
        })),
    );

    protected readonly erroCriterios = computed(() =>
        this.rascunho().criterios.length ? null : 'Escolha ao menos um critério.',
    );
    protected readonly erroGrupos = computed(() => validarGrupos(this.rascunho().grupos));
    protected readonly erroLimiar = computed(() => {
        const { limiar } = this.rascunho();

        return Number.isInteger(limiar) &&
            limiar >= LIMITES_CONFIG.limiarMinimo &&
            limiar <= LIMITES_CONFIG.limiarMaximo
            ? null
            : `Use um número inteiro entre ${LIMITES_CONFIG.limiarMinimo} e ${LIMITES_CONFIG.limiarMaximo}.`;
    });
    protected readonly valido = computed(() => !this.erroCriterios() && !this.erroGrupos() && !this.erroLimiar());

    protected readonly foraDaPoc = computed(() => this.criterios().some((c) => c.marcado && !c.daPoc));
    protected readonly podeAdicionarGrupo = computed(
        () => this.rascunho().grupos.length + 1 < LIMITES_CONFIG.maximoGrupos,
    );

    /** Há mudanças não salvas em relação ao que está no servidor. */
    protected readonly alterado = computed(() => {
        const estado = this.estado();

        return !!estado && JSON.stringify(this.rascunho()) !== JSON.stringify(rascunhoDe(estado));
    });

    protected readonly ultimaAlteracao = computed(() => {
        const c = this.estado()?.configuracao;

        if (!c?.atualizadoEm) {
            return null;
        }

        return { em: c.atualizadoEm, por: c.atualizadoPor ? (this.nomes().get(c.atualizadoPor) ?? null) : null };
    });

    ngOnInit(): void {
        void this.carregar();
    }

    protected async carregar(): Promise<void> {
        this.carregando.set(true);
        this.erroCarga.set(null);

        try {
            this.aplicar(await this.config.obter());
            void this.carregarNomes();
        } catch (erro) {
            this.erroCarga.set(mensagemDeErro(erro, 'Não foi possível carregar a configuração.'));
        } finally {
            this.carregando.set(false);
        }
    }

    protected alternarCriterio(id: string, marcado: boolean): void {
        this.salvoAgora.set(false);
        this.rascunho.update((r) => {
            const escolhidos = marcado ? [...r.criterios, id] : r.criterios.filter((c) => c !== id);
            // Mantém a ordem da lista de critérios disponíveis.
            const ordem = this.estado()?.criteriosDisponiveis.map((c) => c.id) ?? [];

            return { ...r, criterios: ordem.filter((c) => escolhidos.includes(c)) };
        });
    }

    protected renomearGrupo(indice: number, nome: string): void {
        this.salvoAgora.set(false);
        this.rascunho.update((r) => ({ ...r, grupos: r.grupos.map((g, i) => (i === indice ? nome : g)) }));
    }

    protected removerGrupo(indice: number): void {
        this.salvoAgora.set(false);
        this.rascunho.update((r) => ({ ...r, grupos: r.grupos.filter((_, i) => i !== indice) }));
    }

    protected adicionarGrupo(): void {
        const nome = this.novoGrupo().trim();

        if (!nome || !this.podeAdicionarGrupo()) {
            return;
        }

        this.salvoAgora.set(false);
        this.rascunho.update((r) => ({ ...r, grupos: [...r.grupos, nome] }));
        this.novoGrupo.set('');
    }

    protected definirLimiar(valor: string): void {
        this.salvoAgora.set(false);
        this.rascunho.update((r) => ({ ...r, limiar: valor === '' ? NaN : Number(valor) }));
    }

    protected descartar(): void {
        const estado = this.estado();

        if (estado) {
            this.rascunho.set(rascunhoDe(estado));
            this.tentouSalvar.set(false);
            this.erroSalvar.set(null);
        }
    }

    protected async salvar(): Promise<void> {
        this.tentouSalvar.set(true);

        if (!this.valido() || this.salvando()) {
            return;
        }

        const { criterios, grupos, limiar } = this.rascunho();
        this.salvando.set(true);
        this.erroSalvar.set(null);

        try {
            this.aplicar(
                await this.config.salvar({
                    criterios,
                    grupos: [GRUPO_NAO_INFORMADO, ...grupos.map((g) => g.trim())],
                    limiarVies: limiar,
                }),
            );
            this.salvoAgora.set(true);
            this.avisos.mostrar('Configuração salva', { texto: 'Vale a partir das próximas correções.' });
            this.tentouSalvar.set(false);
        } catch (erro) {
            this.erroSalvar.set(mensagemDeErro(erro, 'Não foi possível salvar a configuração.'));
        } finally {
            this.salvando.set(false);
        }
    }

    /** Usado pelo guard de saída da rota. */
    podeSair(): boolean | Promise<boolean> {
        return (
            !this.alterado() ||
            this.confirmacao.confirmar({
                titulo: 'Sair sem salvar?',
                texto: 'As alterações na configuração da correção serão perdidas.',
                confirmar: 'Sair sem salvar',
                cancelar: 'Continuar editando',
                perigo: true,
            })
        );
    }

    protected avisarAoSair(evento: BeforeUnloadEvent): void {
        if (this.alterado()) {
            evento.preventDefault();
        }
    }

    private aplicar(estado: EstadoConfiguracao): void {
        this.estado.set(estado);
        this.rascunho.set(rascunhoDe(estado));
    }

    private async carregarNomes(): Promise<void> {
        try {
            const lista = await this.usuarios.listar();
            this.nomes.set(new Map(lista.map((u) => [u.id, u.nome])));
        } catch {
            // Sem nomes, a tela mostra só a data da última alteração.
        }
    }
}
