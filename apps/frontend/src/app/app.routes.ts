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
            { path: '', pathMatch: 'full', redirectTo: 'redacoes' },
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
                loadComponent: () => import('./features/revisao/revisao-page/revisao-page').then((m) => m.RevisaoPage),
            },
            {
                path: 'alunos',
                title: 'Alunos · Corretor Assistido',
                loadComponent: () => import('./features/alunos/alunos-page/alunos-page').then((m) => m.AlunosPage),
            },
            {
                path: 'alunos/:codigo',
                title: 'Evolução do aluno · Corretor Assistido',
                loadComponent: () => import('./features/alunos/aluno-page/aluno-page').then((m) => m.AlunoPage),
            },
            {
                path: 'metricas',
                title: 'Métricas da POC · Corretor Assistido',
                loadComponent: () =>
                    import('./features/metricas/metricas-page/metricas-page').then((m) => m.MetricasPage),
            },
            {
                path: 'admin',
                canActivate: [perfilGuard('admin')],
                loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
            },
        ],
    },
    { path: '**', redirectTo: 'redacoes' },
];
