import { NomeIcone } from '../../shared/icone/icone';

export type GrupoBusca = 'Páginas' | 'Redações';

export interface ItemBusca {
    readonly id: string;
    readonly grupo: GrupoBusca;
    readonly titulo: string;
    readonly detalhe: string;
    readonly icone: NomeIcone;
    readonly link: string;
}

const MAXIMO_POR_GRUPO = 6;

export function normalizar(texto: string): string {
    return texto
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

/**
 * Filtra os itens: cada palavra digitada precisa aparecer no título ou no
 * detalhe. Sem termo, devolve os itens na ordem recebida. Limita cada grupo
 * para a lista não ficar longa.
 */
export function buscar(termo: string, itens: readonly ItemBusca[]): ItemBusca[] {
    const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
    const contagem = new Map<GrupoBusca, number>();

    return itens.filter((item) => {
        const alvo = normalizar(`${item.titulo} ${item.detalhe}`);

        if (!palavras.every((palavra) => alvo.includes(palavra))) {
            return false;
        }

        const vistos = contagem.get(item.grupo) ?? 0;
        contagem.set(item.grupo, vistos + 1);

        return vistos < MAXIMO_POR_GRUPO;
    });
}
