import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { StatusRedacao } from '../../core/redacoes/redacao.model';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { Icone } from '../../shared/icone/icone';
import { GrupoBusca, ItemBusca, buscar } from './busca';
import { ChamadaService } from '../../core/alunos/chamada.service';
import { PropostasService, descreverPrazo } from '../../core/propostas/propostas.service';
import { AlunosService } from '../../core/redacoes/alunos.service';

const STATUS: Readonly<Record<StatusRedacao, string>> = {
    'aguardando-ia': 'Aguardando IA',
    corrigindo: 'Corrigindo',
    'em-revisao': 'Para revisar',
    devolvida: 'Devolutiva registrada',
};

/** Busca global (Ctrl+K): páginas e, para o professor, redações. Atlas: ds-palette. */
@Component({
    selector: 'app-busca-rapida',
    imports: [Icone],
    templateUrl: './busca-rapida.html',
    styleUrl: './busca-rapida.scss',
    host: { '(document:keydown)': 'atalho($event)' },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuscaRapida {
    private readonly router = inject(Router);
    private readonly auth = inject(AuthService);
    private readonly redacoes = inject(RedacoesService);
    private readonly propostas = inject(PropostasService);
    private readonly alunos = inject(AlunosService);
    private readonly chamada = inject(ChamadaService);

    private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
    private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');

    protected readonly termo = signal('');
    protected readonly ativo = signal(0);

    private readonly itens = computed<ItemBusca[]>(() => {
        const admin = this.auth.temPerfil('admin');
        const pagina = (id: string, titulo: string, link: string, icone: ItemBusca['icone']): ItemBusca => ({
            id: `p-${id}`,
            grupo: 'Páginas',
            titulo,
            detalhe: '',
            icone,
            link,
        });

        const paginas = [
            pagina('inicio', 'Início', '/inicio', 'inicio'),
            ...(admin
                ? [
                      pagina('usuarios', 'Usuários', '/admin/usuarios', 'escudo'),
                      pagina('configuracao', 'Configuração da correção', '/admin/configuracao', 'escudo'),
                      pagina('auditoria', 'Auditoria', '/admin/auditoria', 'escudo'),
                      pagina('metricas', 'Métricas da POC', '/admin/metricas', 'metricas'),
                  ]
                : [
                      pagina('propostas', 'Propostas de redação', '/propostas', 'proposta'),
                      pagina('redacoes', 'Redações', '/redacoes', 'redacoes'),
                      pagina('importar', 'Importar redação', '/redacoes/nova', 'importar'),
                      pagina('alunos', 'Alunos', '/alunos', 'alunos'),
                  ]),
        ];

        if (admin) {
            return paginas;
        }

        // Redações para revisar primeiro: são as que o professor mais procura.
        const ordem: StatusRedacao[] = ['em-revisao', 'aguardando-ia', 'corrigindo', 'devolvida'];
        const redacoes = [...this.redacoes.redacoes()]
            .sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status))
            .map<ItemBusca>((redacao) => ({
                id: `r-${redacao.id}`,
                grupo: 'Redações',
                titulo: `${this.chamada.rotulo(redacao.aluno)} · ${redacao.titulo}`,
                detalhe: `${redacao.turma} · ${STATUS[redacao.status]}`,
                icone: 'redacoes',
                link: `/redacoes/${redacao.id}`,
            }));

        const propostas = [...this.propostas.propostas()]
            .sort((a, b) => Number(a.encerrada) - Number(b.encerrada))
            .map<ItemBusca>((proposta) => ({
                id: `pr-${proposta.id}`,
                grupo: 'Propostas',
                titulo: proposta.tema,
                detalhe: `${proposta.turmas.join(', ')} · ${proposta.encerrada ? 'encerrada' : descreverPrazo(proposta.prazo)}`,
                icone: 'proposta',
                link: `/propostas/${proposta.id}`,
            }));

        const alunos = this.alunos.alunos().map<ItemBusca>((aluno) => ({
            id: `a-${aluno.codigo}`,
            grupo: 'Alunos',
            titulo: this.chamada.rotulo(aluno.codigo),
            detalhe: `${aluno.turma} · ${aluno.versoes.length} ${aluno.versoes.length === 1 ? 'redação' : 'redações'}`,
            icone: 'alunos',
            link: `/alunos/${aluno.codigo}`,
        }));

        return [...paginas, ...propostas, ...redacoes, ...alunos];
    });

    protected readonly resultados = computed(() => buscar(this.termo(), this.itens()));

    protected readonly grupos = computed(() => {
        const porGrupo = new Map<GrupoBusca, { item: ItemBusca; indice: number }[]>();

        this.resultados().forEach((item, indice) => {
            porGrupo.set(item.grupo, [...(porGrupo.get(item.grupo) ?? []), { item, indice }]);
        });

        return [...porGrupo].map(([nome, itens]) => ({ nome, itens }));
    });

    abrir(): void {
        const dialogo = this.dialogo().nativeElement;

        this.termo.set('');
        this.ativo.set(0);

        if (!dialogo.open) {
            dialogo.showModal();
        }

        this.campo().nativeElement.focus();
    }

    protected fechar(): void {
        this.dialogo().nativeElement.close();
    }

    protected digitar(valor: string): void {
        this.termo.set(valor);
        this.ativo.set(0);
    }

    protected teclar(evento: KeyboardEvent): void {
        const total = this.resultados().length;

        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
            evento.preventDefault();

            if (total) {
                this.ativo.update((i) => (i + (evento.key === 'ArrowDown' ? 1 : total - 1)) % total);
                document.getElementById(`busca-${this.ativo()}`)?.scrollIntoView({ block: 'nearest' });
            }
        } else if (evento.key === 'Enter') {
            evento.preventDefault();
            const item = this.resultados()[this.ativo()];

            if (item) {
                this.ir(item);
            }
        }
    }

    protected ir(item: ItemBusca): void {
        this.fechar();
        void this.router.navigateByUrl(item.link);
    }

    protected atalho(evento: KeyboardEvent): void {
        if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
            evento.preventDefault();

            if (this.dialogo().nativeElement.open) {
                this.fechar();
            } else {
                this.abrir();
            }
        }
    }
}
