import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NovaRedacao } from './redacao.model';
import { RedacoesHttpApi } from './redacoes-http.api';
import { ApontamentoApi, TextoApi, deTextoApi } from './redacoes-http.mapeamento';

const APONTAMENTO: ApontamentoApi = {
    id: 'a1',
    criterio: 'Ortografia',
    trecho: 'ja',
    inicio: 3,
    fim: 5,
    sugestao: 'já',
    explicacao: 'Leva acento.',
    variacao: false,
    decisao: 'editada',
    sugestao_final: 'já agora',
};

const TEXTO: TextoApi = {
    id: 't1',
    aluno_codigo: '8A-07',
    turma: '8º A',
    grupo: 'Rural',
    titulo: 'Minha cidade',
    versao: 1,
    origem_id: null,
    conteudo: 'Eu ja fui.',
    status: 'revisao',
    exemplo: false,
    comentario_ia: 'Bom texto.',
    comentario_professor: 'Bom texto.',
    erro_correcao: '',
    criado_em: '2026-11-20T10:00:00Z',
    enviado_em: null,
    apontamentos: [APONTAMENTO],
};

const NOVA: NovaRedacao = {
    aluno: ' Ipê Lilás ',
    turma: '8º A',
    perfil: 'Rural',
    titulo: '',
    origemId: null,
    consentimentoFamilia: true,
    arquivo: null,
    textoColado: 'Eu ja fui.',
};

describe('mapeamento da API de textos', () => {
    it('converte status, decisão e campos', () => {
        const r = deTextoApi(TEXTO);

        expect(r).toMatchObject({ aluno: '8A-07', perfil: 'Rural', status: 'em-revisao', erroCorrecao: undefined });
        expect(r.apontamentos[0]).toMatchObject({
            sugestaoIa: 'já',
            variacaoLinguistica: false,
            decisao: 'ajustada',
            textoProfessor: 'já agora',
        });
        expect(deTextoApi({ ...TEXTO, status: 'pendente' }).status).toBe('aguardando-ia');
        expect(deTextoApi({ ...TEXTO, status: 'concluido' }).status).toBe('devolvida');
        expect(deTextoApi({ ...TEXTO, apontamentos: undefined }).apontamentos).toEqual([]);
    });
});

describe('RedacoesHttpApi', () => {
    let http: HttpTestingController;
    let api: RedacoesHttpApi;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting(), RedacoesHttpApi],
        });
        http = TestBed.inject(HttpTestingController);
        api = TestBed.inject(RedacoesHttpApi);
    });

    afterEach(() => http.verify());

    it('lista com os apontamentos (completo=true)', async () => {
        const promessa = api.listar();
        http.expectOne('/api/textos?completo=true').flush({ textos: [TEXTO] });

        expect((await promessa)[0].apontamentos).toHaveLength(1);
    });

    it('importa texto colado em JSON, com o apelido como identificador', async () => {
        const promessa = api.importar(NOVA);
        const req = http.expectOne('/api/textos');
        expect(req.request.body).toMatchObject({ aluno_codigo: 'Ipê Lilás', grupo: 'Rural', consentimento: true });
        req.flush({ ...TEXTO, status: 'pendente', apontamentos: [] });

        expect((await promessa).status).toBe('aguardando-ia');
    });

    it('importa arquivo por multipart e mostra o erro de leitura', async () => {
        const arquivo = new File(['%PDF'], 'redacao.pdf', { type: 'application/pdf' });
        const promessa = api.importar({ ...NOVA, arquivo });
        const req = http.expectOne('/api/textos/importar');
        const corpo = req.request.body as FormData;
        expect(corpo.get('arquivos')).toBeInstanceOf(File);
        expect(corpo.get('consentimento')).toBe('true');
        req.flush({ criados: [], erros: [{ arquivo: 'redacao.pdf', mensagem: 'O PDF parece ser uma imagem.' }] });

        await expect(promessa).rejects.toThrow('O PDF parece ser uma imagem.');
    });

    it('corrige esperando o resultado e explica a falha', async () => {
        const promessa = api.corrigirComIa('t1');
        const req = http.expectOne('/api/textos/t1/corrigir?aguardar=true');
        req.flush({ ...TEXTO, status: 'pendente', erro_correcao: 'A IA está sobrecarregada.' });

        await expect(promessa).rejects.toThrow('A IA está sobrecarregada.');
    });

    it('decide um apontamento ajustado como "editada" e devolve o texto atualizado', async () => {
        const promessa = api.decidir('t1', 'a1', 'ajustada', ' já agora ');
        const patch = http.expectOne('/api/textos/t1/apontamentos/a1');
        expect(patch.request.body).toEqual({ decisao: 'editada', sugestao_final: 'já agora' });
        patch.flush({ apontamento: APONTAMENTO, pendentes: 0 });
        await new Promise((fim) => setTimeout(fim)); // deixa o PATCH terminar e o GET partir
        http.expectOne('/api/textos/t1').flush(TEXTO);

        expect((await promessa).apontamentos[0].decisao).toBe('ajustada');
    });

    it('aceitar o restante só decide os pendentes', async () => {
        const promessa = api.decidirPendentes('t1', 'aceita');
        const req = http.expectOne('/api/textos/t1/decisoes');
        expect(req.request.body).toEqual({ decisao: 'aceita', apenas_pendentes: true });
        req.flush(TEXTO);

        await promessa;
    });

    it('converte o erro da API em Error com a mensagem pronta', async () => {
        const promessa = api.enviarDevolutiva('t1');
        http.expectOne('/api/textos/t1/enviar').flush(
            { erro: { codigo: 'estado_invalido', mensagem: 'Ainda há apontamentos sem decisão.' } },
            { status: 409, statusText: 'Conflict' },
        );

        await expect(promessa).rejects.toThrow('Ainda há apontamentos sem decisão.');
    });
});
