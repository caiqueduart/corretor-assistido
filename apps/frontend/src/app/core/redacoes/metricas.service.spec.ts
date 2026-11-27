import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ConfigService } from '../admin/config.service';
import { MetricasService } from './metricas.service';
import { RedacoesMockApi } from './mock/redacoes-mock.api';
import { RedacoesApi } from './redacoes.api';
import { RedacoesService } from './redacoes.service';

async function montar(criterios: string[], limiar: number) {
    TestBed.configureTestingModule({
        providers: [
            { provide: RedacoesApi, useClass: RedacoesMockApi },
            {
                provide: ConfigService,
                useValue: { criterios: signal(criterios), limiarVies: signal(limiar), grupos: signal([]) },
            },
        ],
    });
    await TestBed.inject(RedacoesService).carregar();

    return TestBed.inject(MetricasService);
}

describe('MetricasService com a configuração do admin', () => {
    it('usa o limiar de viés configurado', async () => {
        const rigoroso = (await montar(['Ortografia', 'Pontuação'], 5)).porPerfil().filter((l) => l.alerta).length;
        TestBed.resetTestingModule();
        const frouxo = (await montar(['Ortografia', 'Pontuação'], 50)).porPerfil().filter((l) => l.alerta).length;

        expect(rigoroso).toBeGreaterThan(0);
        expect(frouxo).toBe(0);
    });

    it('lista os critérios ativos e mantém os que já aparecem nas correções', async () => {
        const metricas = await montar(['Concordância'], 15);
        const criterios = metricas.porCriterio().map((l) => l.criterio);

        expect(criterios[0]).toBe('Concordância');
        expect(criterios).toEqual(expect.arrayContaining(['Ortografia', 'Pontuação']));
        expect(metricas.limiar()).toBe(15);
    });
});
