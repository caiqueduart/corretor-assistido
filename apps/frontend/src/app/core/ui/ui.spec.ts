import { TestBed } from '@angular/core/testing';

import { AvisosService } from './avisos.service';
import { ConfirmacaoService } from './confirmacao.service';

describe('AvisosService', () => {
    afterEach(() => vi.useRealTimers());

    it('mostra no máximo 3 avisos e some sozinho depois de 5 s', () => {
        vi.useFakeTimers();
        const avisos = TestBed.inject(AvisosService);

        ['a', 'b', 'c', 'd'].forEach((t) => avisos.mostrar(t));
        expect(avisos.avisos().map((a) => a.titulo)).toEqual(['b', 'c', 'd']);

        vi.advanceTimersByTime(5000);
        expect(avisos.avisos()).toEqual([]);
    });
});

describe('ConfirmacaoService', () => {
    it('resolve com a resposta do usuário', async () => {
        const servico = TestBed.inject(ConfirmacaoService);

        const promessa = servico.confirmar({ titulo: 'Sair?', texto: '', confirmar: 'Sair' });
        expect(servico.pedido()?.titulo).toBe('Sair?');
        servico.responder(true);

        expect(await promessa).toBe(true);
        expect(servico.pedido()).toBeNull();
    });

    it('um novo pedido responde "não" ao anterior', async () => {
        const servico = TestBed.inject(ConfirmacaoService);

        const primeiro = servico.confirmar({ titulo: '1', texto: '', confirmar: 'Ok' });
        void servico.confirmar({ titulo: '2', texto: '', confirmar: 'Ok' });

        expect(await primeiro).toBe(false);
        expect(servico.pedido()?.titulo).toBe('2');
    });
});
