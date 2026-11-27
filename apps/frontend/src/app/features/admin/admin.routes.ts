import { CanDeactivateFn, Routes } from '@angular/router';

import { AdminLayout } from './admin-layout';

/** Página com alterações que o usuário pode perder ao sair. */
interface ComAlteracoes {
    podeSair(): boolean;
}

const confirmarSaida: CanDeactivateFn<ComAlteracoes> = (pagina) => pagina.podeSair();

export const ADMIN_ROUTES: Routes = [
    {
        path: '',
        component: AdminLayout,
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'usuarios' },
            {
                path: 'usuarios',
                title: 'Usuários · Administração · Corretor Assistido',
                loadComponent: () => import('./usuarios/usuarios-page').then((m) => m.UsuariosPage),
            },
            {
                path: 'configuracao',
                title: 'Configuração · Administração · Corretor Assistido',
                canDeactivate: [confirmarSaida],
                loadComponent: () => import('./configuracao/configuracao-page').then((m) => m.ConfiguracaoPage),
            },
            {
                path: 'auditoria',
                title: 'Auditoria · Administração · Corretor Assistido',
                loadComponent: () => import('./auditoria/auditoria-page').then((m) => m.AuditoriaPage),
            },
        ],
    },
];
