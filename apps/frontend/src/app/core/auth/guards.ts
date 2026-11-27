import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Perfil } from './auth.model';
import { AuthService } from './auth.service';

/** Exige login. Sem sessão, manda ao login guardando o destino. */
export const autenticadoGuard: CanActivateFn = async (_rota, estado) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.restaurar();

    return auth.logado() || router.createUrlTree(['/login'], { queryParams: { voltar: estado.url } });
};

/** Exige um dos perfis. Sem permissão, volta para a tela inicial. */
export function perfilGuard(...perfis: Perfil[]): CanActivateFn {
    return async () => {
        const auth = inject(AuthService);
        const router = inject(Router);

        await auth.restaurar();

        return auth.temPerfil(...perfis) || router.createUrlTree(['/inicio']);
    };
}

/** Impede abrir o login de novo com a sessão ativa. */
export const visitanteGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.restaurar();

    return !auth.logado() || router.createUrlTree(['/inicio']);
};

/** Aceita só caminhos internos, para não redirecionar para outro site após o login. */
export function destinoSeguro(voltar: string | null | undefined): string {
    return voltar && voltar.startsWith('/') && !voltar.startsWith('//') && !voltar.startsWith('/login')
        ? voltar
        : '/inicio';
}
