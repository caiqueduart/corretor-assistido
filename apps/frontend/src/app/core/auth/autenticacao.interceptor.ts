import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { SessaoService } from './sessao.service';

const ROTA_LOGIN = '/api/auth/login';

/** Envia o token nas chamadas à API e trata a sessão expirada (401). */
export const autenticacaoInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
    if (!requisicao.url.startsWith('/api/')) {
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
