import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { SessaoService } from './sessao.service';

const ROTA_LOGIN = '/api/auth/login';
const ROTA_ALUNO = '/api/aluno/';

/** Envia o token nas chamadas à API e trata a sessão expirada (401). */
export const autenticacaoInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
    // Rotas do aluno usam o código de acesso, não a sessão do professor: um código
    // errado (401) não pode derrubar a sessão de quem estiver logado no navegador.
    if (!requisicao.url.startsWith('/api/') || requisicao.url.startsWith(ROTA_ALUNO)) {
        return proximo(requisicao);
    }

    const token = inject(SessaoService).token();
    const auth = inject(AuthService);
    const autenticada = token ? requisicao.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : requisicao;

    return proximo(autenticada).pipe(
        catchError((erro: unknown) => {
            if (erro instanceof HttpErrorResponse && erro.status === 401 && requisicao.url !== ROTA_LOGIN) {
                auth.sessaoExpirada();
            }

            return throwError(() => erro);
        }),
    );
};
