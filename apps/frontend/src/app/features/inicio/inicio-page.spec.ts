import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuditoriaService } from '../../core/admin/auditoria.service';
import { ConfigService } from '../../core/admin/config.service';
import { UsuariosService } from '../../core/admin/usuarios.service';
import { Perfil } from '../../core/auth/auth.model';
import { AuthService } from '../../core/auth/auth.service';
import { RedacoesMockApi } from '../../core/redacoes/mock/redacoes-mock.api';
import { RedacoesApi } from '../../core/redacoes/redacoes.api';
import { RedacoesService } from '../../core/redacoes/redacoes.service';
import { InicioPage } from './inicio-page';

async function montar(perfil: Perfil): Promise<HTMLElement> {
    TestBed.configureTestingModule({
        providers: [
            provideRouter([]),
            { provide: RedacoesApi, useClass: RedacoesMockApi },
            {
                provide: AuthService,
                useValue: {
                    usuario: signal({ id: 'u1', nome: 'Ana Souza', email: 'a@e', perfil, ativo: true, criadoEm: '' }),
                    perfil: signal(perfil),
                    temPerfil: (...perfis: Perfil[]) => perfis.includes(perfil),
                },
            },
            {
                provide: ConfigService,
                useValue: {
                    criterios: signal(['Ortografia']),
                    limiarVies: signal(15),
                    grupos: signal([]),
                    iaConfigurada: signal(false),
                },
            },
            { provide: UsuariosService, useValue: { listar: async () => [] } },
            { provide: AuditoriaService, useValue: { listar: async () => [] } },
        ],
    });
    await TestBed.inject(RedacoesService).carregar();
    const fixture = TestBed.createComponent(InicioPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
}

describe('InicioPage', () => {
    it('professor vê indicadores e "Continue de onde parou", sem a parte do admin', async () => {
        const el = await montar('professor');

        expect(el.querySelector('h1')?.textContent).toContain('Ana');
        expect(el.querySelectorAll('.kpi')).toHaveLength(3);
        expect(el.textContent).toContain('Continue de onde parou');
        expect(el.querySelector('app-inicio-admin')).toBeNull();
    });

    it('admin vê só sistema e atividade recente, sem as redações', async () => {
        const el = await montar('admin');

        expect(el.querySelector('app-inicio-admin')).not.toBeNull();
        expect(el.querySelectorAll('.kpi')).toHaveLength(0);
        expect(el.textContent).not.toContain('Continue de onde parou');
        expect(el.textContent).toContain('Atividade recente');
        expect(el.textContent).toContain('Simulada');
    });
});
