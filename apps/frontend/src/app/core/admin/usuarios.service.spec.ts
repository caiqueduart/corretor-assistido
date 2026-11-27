import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { UsuariosService, gerarSenha } from './usuarios.service';

const API = {
    id: 'u2',
    nome: 'Bruno',
    email: 'bruno@escola.exemplo',
    perfil: 'professor',
    ativo: true,
    criado_em: '2026-11-02T08:00:00Z',
} as const;

describe('UsuariosService', () => {
    let http: HttpTestingController;
    let servico: UsuariosService;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        http = TestBed.inject(HttpTestingController);
        servico = TestBed.inject(UsuariosService);
    });

    afterEach(() => http.verify());

    it('lista e converte os usuários', async () => {
        const promessa = servico.listar();
        http.expectOne('/api/usuarios').flush({ usuarios: [API] });

        expect(await promessa).toEqual([
            {
                id: 'u2',
                nome: 'Bruno',
                email: 'bruno@escola.exemplo',
                perfil: 'professor',
                ativo: true,
                criadoEm: API.criado_em,
            },
        ]);
    });

    it('cria com POST', async () => {
        const promessa = servico.criar({
            nome: 'Bruno',
            email: 'bruno@escola.exemplo',
            perfil: 'professor',
            senha: 'x'.repeat(10),
        });
        const req = http.expectOne('/api/usuarios');
        expect(req.request.method).toBe('POST');
        req.flush(API);

        expect((await promessa).id).toBe('u2');
    });

    it('altera só os campos enviados com PATCH', async () => {
        const promessa = servico.alterar('u2', { ativo: false });
        const req = http.expectOne('/api/usuarios/u2');
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({ ativo: false });
        req.flush({ ...API, ativo: false });

        expect((await promessa).ativo).toBe(false);
    });
});

describe('gerarSenha', () => {
    it('gera senhas longas o bastante e sem caracteres ambíguos', () => {
        const senha = gerarSenha();

        expect(senha).toHaveLength(14);
        expect(senha).not.toMatch(/[0O1lI]/);
        expect(gerarSenha()).not.toBe(senha);
    });
});
