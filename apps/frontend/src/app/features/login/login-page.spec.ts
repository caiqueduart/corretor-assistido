import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CONTAS_DEMO } from './contas-demo';
import { LoginPage } from './login-page';

describe('LoginPage: acesso rápido', () => {
    it('preenche e-mail e senha ao escolher um perfil, sem mostrar o e-mail no botão', () => {
        TestBed.configureTestingModule({
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
        });
        const fixture = TestBed.createComponent(LoginPage);
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;

        const botoes = Array.from(el.querySelectorAll<HTMLButtonElement>('.demo__opcao'));
        expect(botoes.map((b) => b.querySelector('.demo__perfil')?.textContent?.trim())).toEqual([
            'Administrador',
            'Professor',
        ]);
        expect(el.querySelector('.demo')?.textContent).not.toContain('@');

        botoes[1].click();
        fixture.detectChanges();

        const professor = CONTAS_DEMO.find((c) => c.perfil === 'professor')!;
        expect(el.querySelector<HTMLInputElement>('#campo-email')!.value).toBe(professor.email);
        expect(el.querySelector<HTMLInputElement>('#campo-senha')!.value).toBe(professor.senha);
        expect(botoes[1].getAttribute('aria-pressed')).toBe('true');
    });
});
