import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../auth/auth.service';
import { TOTAL_APELIDOS, gerarApelido } from './apelidos';
import { ChamadaService } from './chamada.service';

describe('gerarApelido', () => {
    it('gera "fauna/flora + cor" sem números', () => {
        const apelido = gerarApelido([]);

        expect(apelido).toMatch(/^[\p{L}-]+ [\p{L}]+$/u);
        expect(TOTAL_APELIDOS).toBeGreaterThan(800);
    });

    it('não repete apelido em uso (sem diferenciar maiúsculas)', () => {
        let i = 0;
        const sequencia = [0, 0, 0, 0, 0.99, 0.99];
        const sortear = () => sequencia[i++ % sequencia.length];
        const primeiro = gerarApelido([], () => 0);

        expect(gerarApelido([primeiro.toUpperCase()], sortear)).not.toBe(primeiro);
    });

    it('acrescenta número quando todos estão em uso', () => {
        const sempre = () => 0;
        const usado = gerarApelido([], sempre);

        expect(gerarApelido([usado], sempre)).toBe(`${usado} 2`);
    });
});

describe('ChamadaService', () => {
    const usuario = signal<{ id: string } | null>({ id: 'u1' });

    beforeEach(() => {
        localStorage.clear();
        usuario.set({ id: 'u1' });
        TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { usuario } }] });
    });

    it('guarda o nome só no navegador, separado por usuário', () => {
        const chamada = TestBed.inject(ChamadaService);
        TestBed.tick();

        chamada.definir('Ipê Lilás', ' Maria Souza ');

        expect(chamada.rotulo('Ipê Lilás')).toBe('Maria Souza (Ipê Lilás)');
        expect(chamada.rotulo('Onça Jade')).toBe('Onça Jade');
        expect(JSON.parse(localStorage.getItem('corretor.chamada.u1')!)).toEqual({ 'Ipê Lilás': 'Maria Souza' });

        usuario.set({ id: 'u2' });
        TestBed.tick();
        expect(chamada.nome('Ipê Lilás')).toBeNull();
    });

    it('exporta e importa a cópia, e recusa arquivo estranho', () => {
        const chamada = TestBed.inject(ChamadaService);
        TestBed.tick();
        chamada.definir('Ipê Lilás', 'Maria');
        const copia = chamada.exportar();

        chamada.esquecer();
        expect(chamada.total()).toBe(0);

        expect(chamada.importar(copia)).toBe(1);
        expect(chamada.nome('Ipê Lilás')).toBe('Maria');
        expect(() => chamada.importar('{"outro":1}')).toThrow('não é uma lista de chamada');
    });
});
