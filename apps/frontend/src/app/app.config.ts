import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { autenticacaoInterceptor } from './core/auth/autenticacao.interceptor';
import { RedacoesMockApi } from './core/redacoes/mock/redacoes-mock.api';
import { RedacoesApi } from './core/redacoes/redacoes.api';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withFetch(), withInterceptors([autenticacaoInterceptor])),
        // Redações ainda vêm do mock; trocar por uma implementação HTTP na migração para a API.
        { provide: RedacoesApi, useClass: RedacoesMockApi },
    ],
};
