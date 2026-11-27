import { Routes } from '@angular/router';

import { autenticadoGuard, perfilGuard, visitanteGuard } from './core/auth/guards';

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
            { path: '', pathMatch: 'full', redirectTo: 'inicio' },
            {
                path: 'inicio',
                title: 'Início · Corretor Assistido',
                data: { trilha: [{ rotulo: 'Início' }] },
                loadComponent: () => import('./features/inicio/inicio-page').then((m) => m.InicioPage),
            },
            {
                // Correção é trabalho do professor. O admin só administra.
                path: '',
                canActivate: [perfilGuard('professor')],
                children: [
                    {
                        path: 'propostas',
                        title: 'Propostas · Corretor Assistido',
                        data: { trilha: [{ rotulo: 'Propostas' }] },
                        loadComponent: () => import('./features/propostas/propostas-page').then((m) => m.PropostasPage),
                    },
                    {
                        path: 'propostas/:id',
                        title: 'Proposta · Corretor Assistido',
                        data: { trilha: [{ rotulo: 'Propostas', link: '/propostas' }, { rotulo: ':proposta' }] },
                        loadComponent: () => import('./features/propostas/proposta-page').then((m) => m.PropostaPage),
                    },
                    {
                        path: 'redacoes',
                        title: 'Redações · Corretor Assistido',
                        data: { trilha: [{ rotulo: 'Redações' }] },
                        loadComponent: () => import('./features/redacoes/fila-page/fila-page').then((m) => m.FilaPage),
                    },
                    {
                        path: 'redacoes/nova',
                        title: 'Importar redação · Corretor Assistido',
                        data: { trilha: [{ rotulo: 'Redações', link: '/redacoes' }, { rotulo: 'Importar redação' }] },
                        loadComponent: () =>
                            import('./features/redacoes/importar-page/importar-page').then((m) => m.ImportarPage),
                    },
                    {
                        path: 'redacoes/:id',
                        title: 'Revisão · Corretor Assistido',
                        data: { trilha: [{ rotulo: 'Redações', link: '/redacoes' }, { rotulo: ':redacao' }] },
                        loadComponent: () =>
                            import('./features/revisao/revisao-page/revisao-page').then((m) => m.RevisaoPage),
                    },
                ],
            },
            {
                path: 'admin',
                canActivate: [perfilGuard('admin')],
                data: { trilha: [{ rotulo: 'Administração', link: '/admin' }] },
                loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
            },
        ],
    },
    { path: '**', redirectTo: 'inicio' },
];
