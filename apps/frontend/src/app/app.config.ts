import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { autenticacaoInterceptor } from './core/auth/autenticacao.interceptor';
import { RedacoesHttpApi } from './core/redacoes/redacoes-http.api';
import { RedacoesApi } from './core/redacoes/redacoes.api';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withFetch(), withInterceptors([autenticacaoInterceptor])),
        { provide: RedacoesApi, useClass: RedacoesHttpApi },
    ],
};
