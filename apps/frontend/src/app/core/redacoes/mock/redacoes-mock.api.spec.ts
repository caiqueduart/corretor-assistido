import { compararVersoes, textoCorrigido } from '../analise';
import { RedacoesMockApi } from './redacoes-mock.api';
import { REDACOES_EXEMPLO } from './redacoes.exemplos';

describe('RedacoesMockApi', () => {
    it('não envia a devolutiva enquanto houver apontamento sem decisão (RN01)', async () => {
        const api = new RedacoesMockApi();

        await expect(api.enviarDevolutiva('d-05')).rejects.toThrow('sem decisão');
    });

    it('envia depois que todos os apontamentos foram decididos', async () => {
        const api = new RedacoesMockApi();

        await api.decidirPendentes('d-05', 'recusada');
        const enviada = await api.enviarDevolutiva('d-05');

        expect(enviada.status).toBe('devolvida');
        expect(enviada.enviadaEm).not.toBeNull();
    });

    it('recusa a importação sem consentimento da família (RN02)', async () => {
        const api = new RedacoesMockApi();

        await expect(
            api.importar({
                aluno: '8A-99',
                turma: '8º A',
                perfil: 'Urbano',
                titulo: '',
                origemId: null,
                consentimentoFamilia: false,
                arquivo: null,
                textoColado: 'Um texto qualquer.',
            }),
        ).rejects.toThrow('consentimento');
    });
});

describe('análise das redações', () => {
    const [v1, v2] = REDACOES_EXEMPLO.filter((redacao) => redacao.aluno === '8A-03');

    it('aplica no texto só as correções validadas', () => {
        const corrigido = textoCorrigido(v1);

        expect(corrigido).toContain('Na semana passada, faltou');
        expect(corrigido).toContain('a gente jantou');
    });

    it('identifica o desvio que persistiu na reescrita', () => {
        const persistiram = compararVersoes(v1, v2).filter((situacao) => situacao.persistiu);

        expect(persistiram.map((situacao) => situacao.apontamento.trecho)).toEqual(['Ninguem']);
    });
});
