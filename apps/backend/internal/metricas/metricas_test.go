package metricas

import (
	"testing"

	"corretor-textual/internal/exemplos"
)

// Os números esperados são os mesmos que a interface da POC mostra
// com os 8 textos de exemplo do roteiro de demonstração.
func TestMetricasDosExemplos(t *testing.T) {
	ts, err := exemplos.Textos()
	if err != nil {
		t.Fatal(err)
	}
	r := Calcular(ts, 15)
	if r.DiscordanciaGeral == nil || *r.DiscordanciaGeral != 26 || r.Decididos != 23 {
		t.Fatalf("discordância geral = %v (%d decisões), quero 26%% em 23", val(r.DiscordanciaGeral), r.Decididos)
	}
	if r.TotalTextos != 8 || r.Concluidos != 4 {
		t.Fatalf("totais = %d/%d", r.TotalTextos, r.Concluidos)
	}
	grupos := map[string]Grupo{}
	for _, g := range r.Equidade {
		grupos[g.Grupo] = g
	}
	casos := map[string]struct {
		disc   int
		alerta string
	}{
		"Rural":                    {45, AlertaVerificarVies},
		"Urbano":                   {14, AlertaOK},
		"Migrante de outra região": {0, AlertaPoucosDados},
		"Não informado":            {0, AlertaOK},
	}
	for nome, c := range casos {
		g, ok := grupos[nome]
		if !ok {
			t.Fatalf("grupo %s ausente", nome)
		}
		if val(g.Discordancia) != c.disc || g.Alerta != c.alerta {
			t.Errorf("%s: discordância %d alerta %s, quero %d %s", nome, val(g.Discordancia), g.Alerta, c.disc, c.alerta)
		}
	}
	if len(r.Versoes) != 2 || r.ReducaoMedia == nil {
		t.Fatalf("versões = %+v", r.Versoes)
	}
	for _, v := range r.Versoes {
		if v.Reducao == nil || *v.Reducao <= 0 || v.DesviosV2Por100 >= v.DesviosV1Por100 {
			t.Errorf("a reescrita de %s devia reduzir os desvios: %+v", v.AlunoCodigo, v)
		}
	}
	var orto *Criterio
	for i := range r.PorCriterio {
		if r.PorCriterio[i].Criterio == "Ortografia" {
			orto = &r.PorCriterio[i]
		}
	}
	if orto == nil || orto.Aceitas+orto.Editadas+orto.Recusadas != orto.Apontamentos {
		t.Fatalf("critério Ortografia inconsistente: %+v", orto)
	}
}

func TestSemDados(t *testing.T) {
	r := Calcular(nil, 15)
	if r.DiscordanciaGeral != nil || r.ReducaoMedia != nil || len(r.Equidade) != 0 {
		t.Fatalf("métricas sem dados devem vir vazias: %+v", r)
	}
}

func val(p *int) int {
	if p == nil {
		return -1
	}
	return *p
}
