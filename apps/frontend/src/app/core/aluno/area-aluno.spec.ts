import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { autenticacaoInterceptor } from '../auth/autenticacao.interceptor';
import { SessaoService } from '../auth/sessao.service';
import { AreaAlunoService } from './area-aluno.service';

const PAINEL = {
    aluno: 'Ipê Lilás',
    turma: '8º A',
    propostas: [
        {
            id: 'p1',
            tema: 'A vida no campo',
            genero: 'Narrativo',
            enunciado: '',
            prazo: null,
            entrega: { texto_id: 't1', status: 'pendente', pode_reenviar: true },
        },
    ],
    devolutivas: [],
};

describe('Área do aluno', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                provideHttpClient(withInterceptors([autenticacaoInterceptor])),
                provideHttpClientTesting(),
            ],
        });
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('entra com o código, converte o painel e guarda o código só na aba', async () => {
        const area = TestBed.inject(AreaAlunoService);

        const promessa = area.entrar(' abcd-efgh ');
        const req = http.expectOne('/api/aluno/acesso');
        expect(req.request.body).toEqual({ codigo: 'ABCD-EFGH' });
        req.flush(PAINEL);
        const painel = await promessa;

        expect(painel.propostas[0].entrega).toEqual({ textoId: 't1', status: 'pendente', podeReenviar: true });
        expect(sessionStorage.getItem('corretor.area-aluno')).toBe('ABCD-EFGH');
        expect(localStorage.getItem('corretor.area-aluno')).toBeNull();

        area.sair();
        expect(sessionStorage.getItem('corretor.area-aluno')).toBeNull();
    });

    it('código errado (401) não derruba a sessão do professor nem leva o token', async () => {
        TestBed.inject(SessaoService).guardar('tok-professor', new Date(Date.now() + 3_600_000).toISOString());
        const sessaoExpirada = vi.spyOn(TestBed.inject(AuthService), 'sessaoExpirada');

        const promessa = firstValueFrom(TestBed.inject(HttpClient).post('/api/aluno/acesso', { codigo: 'X' }));
        const req = http.expectOne('/api/aluno/acesso');
        expect(req.request.headers.has('Authorization')).toBe(false);
        req.flush(
            { erro: { codigo: 'codigo_invalido', mensagem: 'Código não encontrado.' } },
            { status: 401, statusText: 'Unauthorized' },
        );

        await expect(promessa).rejects.toBeTruthy();
        expect(sessaoExpirada).not.toHaveBeenCalled();
        expect(TestBed.inject(SessaoService).token()).toBe('tok-professor');
    });
});
