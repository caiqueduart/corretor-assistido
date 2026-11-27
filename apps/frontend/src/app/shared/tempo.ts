const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias" ou a data (dd/mm). */
export function tempoRelativo(iso: string, agora = new Date()): string {
    const quando = new Date(iso);
    const diferenca = agora.getTime() - quando.getTime();

    if (diferenca < MINUTO) {
        return 'agora';
    }
    if (diferenca < HORA) {
        return `há ${Math.floor(diferenca / MINUTO)} min`;
    }
    if (diferenca < DIA && quando.getDate() === agora.getDate()) {
        return `há ${Math.floor(diferenca / HORA)} h`;
    }

    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
    const dia = new Date(quando.getFullYear(), quando.getMonth(), quando.getDate()).getTime();
    const dias = Math.round((hoje - dia) / DIA);

    if (dias === 1) {
        return 'ontem';
    }
    if (dias < 7) {
        return `há ${dias} dias`;
    }

    return quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora local. */
export function saudacao(agora = new Date()): string {
    const hora = agora.getHours();

    return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
}
