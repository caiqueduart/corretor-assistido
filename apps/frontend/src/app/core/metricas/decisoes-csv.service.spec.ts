import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DecisoesCsvService, nomeArquivoDecisoes } from './decisoes-csv.service';

describe('DecisoesCsvService', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        http = TestBed.inject(HttpTestingController);
        URL.createObjectURL = vi.fn(() => 'blob:teste');
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => http.verify());

    it('baixa o CSV filtrado pela turma com o nome do arquivo certo', async () => {
        const cliques: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            cliques.push(this.download);
        });

        const promessa = TestBed.inject(DecisoesCsvService).baixar(' 8º A ');
        const req = http.expectOne((r) => r.url === '/api/metricas/decisoes.csv');
        expect(req.request.params.get('turma')).toBe('8º A');
        expect(req.request.responseType).toBe('blob');
        req.flush(new Blob(['texto_id,versao\n']));
        await promessa;

        expect(cliques).toHaveLength(1);
        expect(cliques[0]).toMatch(/^decisoes-8o-a-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('sem turma, não envia o filtro', async () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        const promessa = TestBed.inject(DecisoesCsvService).baixar();
        const req = http.expectOne('/api/metricas/decisoes.csv');
        expect(req.request.params.has('turma')).toBe(false);
        req.flush(new Blob(['']));
        await promessa;
    });
});

describe('DecisoesCsvService com proposta', () => {
    it('envia o filtro de proposta junto com a turma', async () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        const http = TestBed.inject(HttpTestingController);
        URL.createObjectURL = vi.fn(() => 'blob:teste');
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        const promessa = TestBed.inject(DecisoesCsvService).baixar('', 'p1');
        const req = http.expectOne((r) => r.url === '/api/metricas/decisoes.csv');
        expect(req.request.params.get('proposta')).toBe('p1');
        expect(req.request.params.has('turma')).toBe(false);
        req.flush(new Blob(['']));
        await promessa;
        http.verify();
    });
});

describe('nomeArquivoDecisoes', () => {
    it('inclui a turma normalizada e a data', () => {
        const dia = new Date(2026, 10, 7);

        expect(nomeArquivoDecisoes('', dia)).toBe('decisoes-2026-11-07.csv');
        expect(nomeArquivoDecisoes('9º B – Manhã', dia)).toBe('decisoes-9o-b-manha-2026-11-07.csv');
    });
});
