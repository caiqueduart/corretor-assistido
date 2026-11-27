import { TestBed } from '@angular/core/testing';

import { UsuariosService } from '../../../core/admin/usuarios.service';
import { Usuario } from '../../../core/auth/auth.model';
import { UsuarioFormulario, UsuarioSalvo } from './usuario-formulario';

const BRUNO: Usuario = {
    id: 'u2',
    nome: 'Bruno',
    email: 'bruno@escola.exemplo',
    perfil: 'professor',
    ativo: true,
    criadoEm: '2026-11-02T08:00:00Z',
};

function montar(usuario: Usuario | null, ehVoce = false) {
    const api = {
        criar: vi.fn(async (novo) => ({ ...BRUNO, ...novo, id: 'novo' })),
        alterar: vi.fn(async (_id: string, alt) => ({ ...BRUNO, ...alt })),
    };

    TestBed.configureTestingModule({ providers: [{ provide: UsuariosService, useValue: api }] });
    const fixture = TestBed.createComponent(UsuarioFormulario);
    fixture.componentRef.setInput('usuario', usuario);
    fixture.componentRef.setInput('ehVoce', ehVoce);
    fixture.detectChanges();

    const salvos: UsuarioSalvo[] = [];
    fixture.componentInstance.salvo.subscribe((s) => salvos.push(s));
    const el = fixture.nativeElement as HTMLElement;

    const preencher = (seletor: string, valor: string) => {
        const campo = el.querySelector<HTMLInputElement>(seletor)!;
        campo.value = valor;
        campo.dispatchEvent(new Event('input'));
    };
    const enviar = async () => {
        el.querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
    };

    return { fixture, el, api, salvos, preencher, enviar };
}

describe('UsuarioFormulario', () => {
    it('cria um usuário com a senha inicial', async () => {
        const { api, salvos, preencher, enviar } = montar(null);

        preencher('#usuario-nome', ' Carla ');
        preencher('#usuario-email', 'carla@escola.exemplo');
        preencher('#usuario-senha', 'senha-forte-1');
        await enviar();

        expect(api.criar).toHaveBeenCalledWith({
            nome: 'Carla',
            email: 'carla@escola.exemplo',
            perfil: 'professor',
            senha: 'senha-forte-1',
        });
        expect(salvos[0]).toMatchObject({ novo: true, senha: 'senha-forte-1' });
    });

    it('não envia senha curta', async () => {
        const { el, api, preencher, enviar } = montar(null);

        preencher('#usuario-nome', 'Carla');
        preencher('#usuario-email', 'carla@escola.exemplo');
        preencher('#usuario-senha', 'curta');
        await enviar();

        expect(api.criar).not.toHaveBeenCalled();
        expect(el.textContent).toContain('pelo menos 10 caracteres');
    });

    it('na edição envia só o que mudou', async () => {
        const { el, api, salvos, enviar } = montar(BRUNO);

        el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
        await enviar();

        expect(api.alterar).toHaveBeenCalledWith('u2', { ativo: false });
        expect(salvos[0]).toMatchObject({ novo: false, senha: null });
    });

    it('sem mudanças, não chama a API', async () => {
        const { api, salvos, enviar } = montar(BRUNO);

        await enviar();

        expect(api.alterar).not.toHaveBeenCalled();
        expect(salvos).toHaveLength(1);
    });

    it('o admin não pode mudar o próprio perfil nem se desativar', () => {
        const { el } = montar({ ...BRUNO, perfil: 'admin' }, true);

        const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type=radio]'));
        expect(radios.every((r) => r.disabled)).toBe(true);
        expect(el.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);
    });
});
