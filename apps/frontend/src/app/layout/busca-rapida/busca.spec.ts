import { ItemBusca, buscar } from './busca';

const item = (id: string, grupo: ItemBusca['grupo'], titulo: string, detalhe = ''): ItemBusca => ({
    id,
    grupo,
    titulo,
    detalhe,
    icone: 'redacoes',
    link: `/${id}`,
});

describe('busca rápida', () => {
    const itens = [
        item('inicio', 'Páginas', 'Início'),
        item('r1', 'Redações', '8A-07 · Minha cidade', '8º A · Para revisar'),
        item('r2', 'Redações', '8B-03 · Férias na roça', '8º B · Devolvida'),
    ];

    it('sem termo, mostra tudo', () => {
        expect(buscar('', itens)).toHaveLength(3);
    });

    it('ignora acentos e maiúsculas e exige todas as palavras', () => {
        expect(buscar('ROCA', itens).map((i) => i.id)).toEqual(['r2']);
        expect(buscar('8a-07 cidade', itens).map((i) => i.id)).toEqual(['r1']);
        expect(buscar('revisar', itens).map((i) => i.id)).toEqual(['r1']);
    });

    it('limita cada grupo a 6 resultados', () => {
        const muitos = Array.from({ length: 10 }, (_, i) => item(`r${i}`, 'Redações', `Texto ${i}`));

        expect(buscar('texto', muitos)).toHaveLength(6);
    });
});
