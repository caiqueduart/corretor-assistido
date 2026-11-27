/**
 * Apelidos que identificam o aluno no sistema no lugar do nome (pseudonimização):
 * fauna ou flora brasileira + uma cor que não varia em gênero ("Ipê Lilás",
 * "Onça Jade"). Não têm relação com a identidade da criança.
 */
const FAUNA = [
    'Anta',
    'Arara',
    'Ariranha',
    'Beija-flor',
    'Bem-te-vi',
    'Boto',
    'Capivara',
    'Coruja',
    'Cutia',
    'Garça',
    'Gavião',
    'Jabuti',
    'Jacaré',
    'Lobo-guará',
    'Martim-pescador',
    'Mico-leão',
    'Onça',
    'Paca',
    'Peixe-boi',
    'Pirarucu',
    'Preguiça',
    'Quati',
    'Sabiá',
    'Saíra',
    'Seriema',
    'Tamanduá',
    'Tatu',
    'Tucano',
    'Uirapuru',
] as const;

const FLORA = [
    'Açaí',
    'Angico',
    'Araucária',
    'Aroeira',
    'Babaçu',
    'Bromélia',
    'Buriti',
    'Cajueiro',
    'Cambuci',
    'Carnaúba',
    'Embaúba',
    'Ingá',
    'Ipê',
    'Jabuticabeira',
    'Jatobá',
    'Jequitibá',
    'Juazeiro',
    'Mandacaru',
    'Orquídea',
    'Pau-brasil',
    'Pequi',
    'Pitangueira',
    'Samaúma',
    'Vitória-régia',
] as const;

/** Cores invariáveis em gênero: servem para qualquer bicho ou planta. */
const CORES = [
    'Âmbar',
    'Anil',
    'Azul',
    'Bordô',
    'Cinza',
    'Coral',
    'Índigo',
    'Jade',
    'Lilás',
    'Marfim',
    'Ocre',
    'Oliva',
    'Rosa',
    'Turquesa',
    'Verde',
    'Vinho',
] as const;

const NOMES: readonly string[] = [...FAUNA, ...FLORA];

/** Quantidade de apelidos distintos possíveis (sem o número de desempate). */
export const TOTAL_APELIDOS = NOMES.length * CORES.length;

/**
 * Sorteia um apelido que ainda não está em uso (comparação sem diferenciar
 * maiúsculas). Se todos estiverem em uso, acrescenta um número.
 */
export function gerarApelido(emUso: Iterable<string>, sortear: () => number = Math.random): string {
    const usados = new Set([...emUso].map((apelido) => apelido.toLocaleLowerCase('pt-BR')));
    const escolher = <T>(lista: readonly T[]) => lista[Math.floor(sortear() * lista.length)];

    for (let tentativa = 0; tentativa < 200; tentativa++) {
        const apelido = `${escolher(NOMES)} ${escolher(CORES)}`;

        if (!usados.has(apelido.toLocaleLowerCase('pt-BR'))) {
            return apelido;
        }
    }

    const base = `${escolher(NOMES)} ${escolher(CORES)}`;
    let numero = 2;

    while (usados.has(`${base} ${numero}`.toLocaleLowerCase('pt-BR'))) {
        numero++;
    }

    return `${base} ${numero}`;
}
