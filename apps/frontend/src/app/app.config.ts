import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { RedacoesMockApi } from './core/redacoes/mock/redacoes-mock.api';
import { RedacoesApi } from './core/redacoes/redacoes.api';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes, withComponentInputBinding()),
        // Trocar por uma implementação HTTP quando o back-end estiver pronto.
        { provide: RedacoesApi, useClass: RedacoesMockApi },
    ],
};
