import { saudacao, tempoRelativo } from './tempo';

describe('tempo', () => {
    const agora = new Date(2026, 10, 27, 15, 0);
    const menos = (ms: number) => new Date(agora.getTime() - ms).toISOString();

    it.each([
        [menos(20_000), 'agora'],
        [menos(5 * 60_000), 'há 5 min'],
        [menos(2 * 3_600_000), 'há 2 h'],
        [new Date(2026, 10, 26, 20, 0).toISOString(), 'ontem'],
        [new Date(2026, 10, 24, 9, 0).toISOString(), 'há 3 dias'],
        [new Date(2026, 9, 2, 9, 0).toISOString(), '02/10'],
    ])('%s → %s', (iso, esperado) => {
        expect(tempoRelativo(iso, agora)).toBe(esperado);
    });

    it('cumprimenta pela hora', () => {
        expect(saudacao(new Date(2026, 0, 1, 9))).toBe('Bom dia');
        expect(saudacao(new Date(2026, 0, 1, 14))).toBe('Boa tarde');
        expect(saudacao(new Date(2026, 0, 1, 20))).toBe('Boa noite');
    });
});
