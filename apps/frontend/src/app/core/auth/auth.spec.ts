import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { codigoDeErro, mensagemDeErro } from '../api/erro-api';
import { UsuarioApi } from './auth.model';
import { AuthService } from './auth.service';
import { autenticacaoInterceptor } from './autenticacao.interceptor';
import { autenticadoGuard, destinoSeguro, perfilGuard, visitanteGuard } from './guards';
import { SessaoService } from './sessao.service';

const ADMIN: UsuarioApi = {
    id: 'u1',
    nome: 'Ana Admin',
    email: 'ana@escola.exemplo',
    perfil: 'admin',
    ativo: true,
    criado_em: '2026-11-01T10:00:00Z',
};

const DAQUI_A_UMA_HORA = () => new Date(Date.now() + 3_600_000).toISOString();

function configurar(): { http: HttpTestingController; auth: AuthService; sessao: SessaoService } {
    TestBed.configureTestingModule({
        providers: [
            provideRouter([{ path: '**', children: [] }]),
            provideHttpClient(withInterceptors([autenticacaoInterceptor])),
            provideHttpClientTesting(),
        ],
    });

    return {
        http: TestBed.inject(HttpTestingController),
        auth: TestBed.inject(AuthService),
        sessao: TestBed.inject(SessaoService),
    };
}

async function rodarGuard(guard: typeof autenticadoGuard, url = '/metricas'): Promise<unknown> {
    return TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<unknown>;
}

beforeEach(() => localStorage.clear());

describe('SessaoService', () => {
    it('guarda e lê o token no localStorage', () => {
        const { sessao } = configurar();
        const expira = DAQUI_A_UMA_HORA();

        sessao.guardar('abc', expira);

        expect(sessao.token()).toBe('abc');
        expect(JSON.parse(localStorage.getItem('corretor.sessao')!)).toEqual({ token: 'abc', expiraEm: expira });
    });

    it('descarta o token expirado', () => {
        const { sessao } = configurar();

        sessao.guardar('abc', new Date(Date.now() - 1000).toISOString());

        expect(sessao.token()).toBeNull();
        expect(localStorage.getItem('corretor.sessao')).toBeNull();
    });
});

describe('AuthService', () => {
    it('faz login, guarda o token e expõe o usuário', async () => {
        const { http, auth, sessao } = configurar();

        const promessa = auth.login('ana@escola.exemplo', 'segredo123');
        const req = http.expectOne('/api/auth/login');
        expect(req.request.body).toEqual({ email: 'ana@escola.exemplo', senha: 'segredo123' });
        req.flush({ token: 'tok', expira_em: DAQUI_A_UMA_HORA(), usuario: ADMIN });

        const usuario = await promessa;

        expect(usuario.criadoEm).toBe(ADMIN.criado_em);
        expect(auth.logado()).toBe(true);
        expect(auth.temPerfil('admin')).toBe(true);
        expect(auth.temPerfil('professor')).toBe(false);
        expect(sessao.token()).toBe('tok');
    });

    it('restaura o usuário com o token guardado', async () => {
        const { http, auth, sessao } = configurar();
        sessao.guardar('tok', DAQUI_A_UMA_HORA());

        const promessa = auth.restaurar();
        const req = http.expectOne('/api/me');
        expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
        req.flush(ADMIN);
        await promessa;

        expect(auth.usuario()?.nome).toBe('Ana Admin');
    });

    it('não chama a API para restaurar sem token', async () => {
        const { http, auth } = configurar();

        await auth.restaurar();

        http.expectNone('/api/me');
        expect(auth.logado()).toBe(false);
    });

    it('logout encerra a sessão no servidor e localmente', async () => {
        const { http, auth, sessao } = configurar();
        sessao.guardar('tok', DAQUI_A_UMA_HORA());

        const promessa = auth.logout();
        http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
        await promessa;

        expect(sessao.token()).toBeNull();
        expect(auth.logado()).toBe(false);
    });
});

describe('autenticacaoInterceptor', () => {
    it('não envia o token para fora da API', async () => {
        const { http, sessao } = configurar();
        sessao.guardar('tok', DAQUI_A_UMA_HORA());

        void firstValueFrom(TestBed.inject(HttpClient).get('/assets/x.json'));

        expect(http.expectOne('/assets/x.json').request.headers.has('Authorization')).toBe(false);
    });

    it('encerra a sessão e volta ao login quando a API responde 401', async () => {
        const { http, auth, sessao } = configurar();
        const router = TestBed.inject(Router);
        const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        sessao.guardar('tok', DAQUI_A_UMA_HORA());

        const promessa = firstValueFrom(TestBed.inject(HttpClient).get('/api/textos'));
        http.expectOne('/api/textos').flush(
            { erro: { codigo: 'sessao_expirada', mensagem: 'Sua sessão expirou.' } },
            { status: 401, statusText: 'Unauthorized' },
        );

        await expect(promessa).rejects.toBeInstanceOf(HttpErrorResponse);
        expect(sessao.token()).toBeNull();
        expect(auth.logado()).toBe(false);
        expect(navegar).toHaveBeenCalledWith(
            ['/login'],
            expect.objectContaining({ queryParams: expect.objectContaining({ expirada: 1 }) }),
        );
    });

    it('não trata como sessão expirada a senha errada no login', async () => {
        const { http, auth } = configurar();
        const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');

        const promessa = auth.login('ana@escola.exemplo', 'errada');
        http.expectOne('/api/auth/login').flush(
            { erro: { codigo: 'credenciais_invalidas', mensagem: 'E-mail ou senha incorretos.' } },
            { status: 401, statusText: 'Unauthorized' },
        );

        await expect(promessa).rejects.toSatisfy((e) => mensagemDeErro(e) === 'E-mail ou senha incorretos.');
        expect(navegar).not.toHaveBeenCalled();
    });
});

describe('guards', () => {
    it('autenticadoGuard manda ao login guardando o destino', async () => {
        configurar();

        const resultado = await rodarGuard(autenticadoGuard, '/metricas');

        expect(resultado).toBeInstanceOf(UrlTree);
        expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/login?voltar=%2Fmetricas');
    });

    it('perfilGuard libera o perfil certo e barra os outros', async () => {
        const { http, auth } = configurar();
        const promessa = auth.login('ana@escola.exemplo', 'x');
        http.expectOne('/api/auth/login').flush({
            token: 'tok',
            expira_em: DAQUI_A_UMA_HORA(),
            usuario: { ...ADMIN, perfil: 'professor' },
        });
        await promessa;

        expect(await rodarGuard(perfilGuard('professor', 'admin'))).toBe(true);
        expect(await rodarGuard(perfilGuard('admin'))).toBeInstanceOf(UrlTree);
        expect(await rodarGuard(visitanteGuard)).toBeInstanceOf(UrlTree);
    });

    it('destinoSeguro só aceita caminhos internos', () => {
        expect(destinoSeguro('/admin/usuarios')).toBe('/admin/usuarios');
        expect(destinoSeguro('//site.exemplo')).toBe('/redacoes');
        expect(destinoSeguro('https://site.exemplo')).toBe('/redacoes');
        expect(destinoSeguro('/login')).toBe('/redacoes');
        expect(destinoSeguro(undefined)).toBe('/redacoes');
    });
});

describe('erro-api', () => {
    it('extrai código e mensagem do corpo de erro da API', () => {
        const erro = new HttpErrorResponse({
            status: 409,
            error: { erro: { codigo: 'email_em_uso', mensagem: 'Já existe um usuário com este e-mail.' } },
        });

        expect(codigoDeErro(erro)).toBe('email_em_uso');
        expect(mensagemDeErro(erro)).toBe('Já existe um usuário com este e-mail.');
    });

    it('explica a falta de conexão', () => {
        expect(mensagemDeErro(new HttpErrorResponse({ status: 0 }))).toContain('servidor');
    });
});
