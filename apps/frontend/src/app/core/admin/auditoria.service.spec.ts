import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuditoriaService, descreverAlvo, descreverDetalhe, rotuloAcao } from './auditoria.service';

describe('AuditoriaService', () => {
    it('busca com o limite e converte os registros', async () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        const http = TestBed.inject(HttpTestingController);

        const promessa = TestBed.inject(AuditoriaService).listar(500);
        http.expectOne('/api/auditoria?limite=500').flush({
            registros: [
                {
                    id: 7,
                    usuario_id: 'u1',
                    acao: 'login',
                    entidade: 'usuario',
                    entidade_id: 'u1',
                    detalhe: '',
                    criado_em: '2026-11-20T12:00:00Z',
                },
            ],
        });

        expect(await promessa).toEqual([
            {
                id: 7,
                usuarioId: 'u1',
                acao: 'login',
                entidade: 'usuario',
                entidadeId: 'u1',
                detalhe: '',
                criadoEm: '2026-11-20T12:00:00Z',
            },
        ]);
        http.verify();
    });
});

describe('descrição dos registros', () => {
    it('traduz as ações conhecidas e mantém as desconhecidas legíveis', () => {
        expect(rotuloAcao('enviar_devolutiva')).toBe('Enviou devolutiva');
        expect(rotuloAcao('acao_nova')).toBe('Acao nova');
    });

    it.each([
        ['criar_texto', 'versao=2 origem=docx', 'versão 2 · arquivo DOCX'],
        ['criar_texto', 'versao=1 origem=colado', 'versão 1 · texto colado'],
        ['carregar_exemplos', '8', '8 textos'],
        ['decidir_todos', 'decisao=recusada apontamentos=1', 'Recusou 1 apontamento'],
        ['corrigir', 'motor=simulado apontamentos=1 descartados=0 duracao=0s', 'motor simulado · 1 apontamento'],
        ['decidir_todos', 'decisao=aceita apontamentos=3 pendentes=true', 'Aceitou 3 apontamentos pendentes'],
        [
            'alterar_config',
            'criterios=Ortografia,Pontuação limiar=15',
            'critérios: Ortografia, Pontuação · limiar 15 p.p.',
        ],
        ['criar_usuario', 'perfil=leitura', 'perfil Leitura'],
        [
            'alterar_usuario',
            'nome perfil=admin ativo=false senha',
            'nome alterado · perfil Administrador · acesso desativado · senha redefinida',
        ],
        ['excluir_texto', '', ''],
    ])('%s "%s" → "%s"', (acao, detalhe, esperado) => {
        expect(descreverDetalhe({ acao, detalhe })).toBe(esperado);
    });

    it('mostra o nome do usuário afetado', () => {
        const nomes = new Map([['u2', 'Bruno']]);
        const base = { usuarioId: 'u1', entidade: 'usuario' };

        expect(descreverAlvo({ ...base, acao: 'alterar_usuario', entidadeId: 'u2' }, nomes)).toBe('Bruno');
        expect(descreverAlvo({ ...base, acao: 'login', entidadeId: 'u1' }, nomes)).toBe('');
        expect(descreverAlvo({ ...base, acao: 'carregar_exemplos', entidade: 'texto', entidadeId: '' }, nomes)).toBe(
            'textos de exemplo',
        );
    });
});
