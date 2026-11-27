import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuditoriaService, autorDe, descreverAlvo, rotuloAcao } from '../../core/admin/auditoria.service';
import { ConfigService } from '../../core/admin/config.service';
import { UsuariosService } from '../../core/admin/usuarios.service';
import { PERFIS, ROTULO_PERFIL, Usuario } from '../../core/auth/auth.model';
import { MetricasService } from '../../core/redacoes/metricas.service';
import { Esqueleto } from '../../shared/esqueleto/esqueleto';
import { Icone } from '../../shared/icone/icone';
import { tempoRelativo } from '../../shared/tempo';

interface Atividade {
    readonly id: number;
    readonly autor: string;
    readonly acao: string;
    readonly alvo: string;
    readonly quando: string;
}

/** Parte da tela inicial só do admin: equidade, sistema e atividade recente. */
@Component({
    selector: 'app-inicio-admin',
    imports: [RouterLink, Icone, Esqueleto],
    templateUrl: './inicio-admin.html',
    styleUrl: './inicio-admin.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioAdmin implements OnInit {
    private readonly usuariosApi = inject(UsuariosService);
    private readonly auditoria = inject(AuditoriaService);
    protected readonly metricas = inject(MetricasService);
    protected readonly config = inject(ConfigService);

    protected readonly tempo = tempoRelativo;
    private readonly usuarios = signal<Usuario[] | null>(null);
    protected readonly atividades = signal<Atividade[] | null>(null);
    protected readonly erro = signal(false);

    protected readonly alertas = computed(() => this.metricas.porPerfil().filter((linha) => linha.alerta));

    protected readonly equipe = computed(() => {
        const ativos = (this.usuarios() ?? []).filter((u) => u.ativo);

        return PERFIS.map((perfil) => ({
            perfil,
            rotulo: ROTULO_PERFIL[perfil],
            quantidade: ativos.filter((u) => u.perfil === perfil).length,
        }));
    });

    protected readonly carregandoEquipe = computed(() => this.usuarios() === null && !this.erro());

    async ngOnInit(): Promise<void> {
        try {
            const [usuarios, registros] = await Promise.all([this.usuariosApi.listar(), this.auditoria.listar(6)]);
            const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));

            this.usuarios.set(usuarios);
            this.atividades.set(
                registros.map((r) => ({
                    id: r.id,
                    autor: autorDe(r, nomes),
                    acao: rotuloAcao(r.acao).toLowerCase(),
                    alvo: descreverAlvo(r, nomes),
                    quando: r.criadoEm,
                })),
            );
        } catch {
            this.erro.set(true);
        }
    }
}
