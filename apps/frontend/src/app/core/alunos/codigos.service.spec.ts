import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CodigosService } from './codigos.service';

const ATIVO = {
    id: 'c1',
    aluno_codigo: 'Ipê Lilás',
    turma: '8º A',
    grupo: 'Rural',
    criado_em: '2026-11-27T10:00:00Z',
    ultimo_uso: null,
};

describe('CodigosService', () => {
    let http: HttpTestingController;
    let servico: CodigosService;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        http = TestBed.inject(HttpTestingController);
        servico = TestBed.inject(CodigosService);
    });

    afterEach(() => http.verify());

    it('gera com consentimento, devolve os códigos e recarrega os ativos', async () => {
        const promessa = servico.gerar([{ aluno: 'Ipê Lilás', turma: '8º A', grupo: 'Rural' }], true);
        const req = http.expectOne('/api/codigos');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            consentimento: true,
            alunos: [{ aluno_codigo: 'Ipê Lilás', turma: '8º A', grupo: 'Rural' }],
        });
        req.flush({ codigos: [{ aluno_codigo: 'Ipê Lilás', turma: '8º A', codigo: 'K7PM-3QXA' }] });
        await Promise.resolve();
        await new Promise((fim) => setTimeout(fim));
        http.expectOne((r) => r.url === '/api/codigos' && r.method === 'GET').flush({ codigos: [ATIVO] });

        expect(await promessa).toEqual([{ aluno: 'Ipê Lilás', turma: '8º A', codigo: 'K7PM-3QXA' }]);
        expect(servico.ativos()[0]).toMatchObject({ aluno: 'Ipê Lilás', grupo: 'Rural', ultimoUso: null });
    });

    it('revoga codificando o apelido na URL', async () => {
        const promessa = servico.revogar('Ipê Lilás');
        http.expectOne(`/api/codigos/${encodeURIComponent('Ipê Lilás')}`).flush(null, {
            status: 204,
            statusText: 'No Content',
        });
        await promessa;
    });
});
