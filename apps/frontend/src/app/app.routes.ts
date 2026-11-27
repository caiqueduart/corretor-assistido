import { Routes } from '@angular/router';

import { autenticadoGuard, inicioGuard, perfilGuard, visitanteGuard } from './core/auth/guards';

export const routes: Routes = [
    {
        path: 'login',
        title: 'Entrar · Corretor Assistido',
        canActivate: [visitanteGuard],
        loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
    },
    {
        path: '',
        canActivate: [autenticadoGuard],
        children: [
            { path: '', pathMatch: 'full', canActivate: [inicioGuard], children: [] },
            {
                // Correção é trabalho do professor. O admin só administra.
                path: '',
                canActivate: [perfilGuard('professor')],
                children: [
                    {
                        path: 'redacoes',
                        title: 'Redações · Corretor Assistido',
                        loadComponent: () => import('./features/redacoes/fila-page/fila-page').then((m) => m.FilaPage),
                    },
                    {
                        path: 'redacoes/nova',
                        title: 'Importar redação · Corretor Assistido',
                        loadComponent: () =>
                            import('./features/redacoes/importar-page/importar-page').then((m) => m.ImportarPage),
                    },
                    {
                        path: 'redacoes/:id',
                        title: 'Revisão · Corretor Assistido',
                        loadComponent: () =>
                            import('./features/revisao/revisao-page/revisao-page').then((m) => m.RevisaoPage),
                    },
                ],
            },
            {
                path: 'admin',
                canActivate: [perfilGuard('admin')],
                loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
            },
        ],
    },
    { path: '**', redirectTo: '' },
];
