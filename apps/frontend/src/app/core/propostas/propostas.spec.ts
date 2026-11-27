import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Redacao } from '../redacoes/redacao.model';
import { progressoDe, progressoPorProposta } from './progresso';
import { PropostasService, descreverPrazo, diasAtePrazo, formatarPrazo } from './propostas.service';

const PROPOSTA_API = {
    id: 'p1',
    tema: 'A vida no campo',
    genero: 'Narrativo',
    enunciado: '',
    turmas: ['8º A'],
    prazo: '2026-12-10',
    encerrada: false,
    criado_por: 'u1',
    criado_em: '2026-11-20T10:00:00Z',
};

describe('prazos', () => {
    const hoje = new Date(2026, 10, 27, 15);

    it.each([
        [null, 'sem prazo'],
        ['2026-11-27', 'vence hoje'],
        ['2026-11-28', 'vence amanhã'],
        ['2026-12-01', 'vence em 4 dias'],
        ['2026-11-26', 'venceu ontem'],
        ['2026-11-20', 'venceu há 7 dias'],
    ])('%s → %s', (prazo, esperado) => {
        expect(descreverPrazo(prazo, hoje)).toBe(esperado);
    });

    it('conta dias por data local e formata sem fuso horário', () => {
        expect(diasAtePrazo('2026-12-10', hoje)).toBe(13);
        expect(formatarPrazo('2026-12-01')).toBe('01/12');
    });
});

describe('progressoPorProposta', () => {
    it('conta as redações de cada proposta por situação, ignorando as avulsas', () => {
        const r = (status: Redacao['status'], propostaId: string | null) => ({ status, propostaId }) as Redacao;
        const mapa = progressoPorProposta([
            r('aguardando-ia', 'p1'),
            r('corrigindo', 'p1'),
            r('em-revisao', 'p1'),
            r('devolvida', 'p1'),
            r('devolvida', null),
        ]);

        expect(progressoDe(mapa, 'p1')).toEqual({ total: 4, aguardandoIa: 2, revisao: 1, devolvidas: 1 });
        expect(progressoDe(mapa, 'outra').total).toBe(0);
    });
});

describe('PropostasService', () => {
    let http: HttpTestingController;
    let servico: PropostasService;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        http = TestBed.inject(HttpTestingController);
        servico = TestBed.inject(PropostasService);
    });

    afterEach(() => http.verify());

    it('carrega as propostas e os gêneros', async () => {
        const promessa = servico.carregar();
        http.expectOne('/api/propostas').flush({ propostas: [PROPOSTA_API], generos: ['Narrativo', 'Outro'] });
        await promessa;

        expect(servico.proposta('p1')?.criadoPor).toBe('u1');
        expect(servico.generos()).toEqual(['Narrativo', 'Outro']);
        expect(servico.abertas()).toHaveLength(1);
    });

    it('encerrar atualiza a lista e erros viram mensagem pronta', async () => {
        const carga = servico.carregar();
        http.expectOne('/api/propostas').flush({ propostas: [PROPOSTA_API], generos: [] });
        await carga;

        const encerrar = servico.alterar('p1', { encerrada: true });
        const req = http.expectOne('/api/propostas/p1');
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({ encerrada: true });
        req.flush({ ...PROPOSTA_API, encerrada: true });
        await encerrar;
        expect(servico.abertas()).toHaveLength(0);

        const excluir = servico.excluir('p1');
        http.expectOne('/api/propostas/p1').flush(
            { erro: { codigo: 'estado_invalido', mensagem: 'A proposta tem redações e não pode ser excluída.' } },
            { status: 409, statusText: 'Conflict' },
        );
        await expect(excluir).rejects.toThrow('tem redações');
    });
});
