// Package metricas calcula os indicadores da hipótese da POC:
// discordância professor × IA, auditoria de equidade por perfil
// sociolinguístico e ganho de qualidade entre versões.
package metricas

import (
	"math"
	"sort"

	"corretor-textual/internal/dominio"
)

type Criterio struct {
	Criterio     string `json:"criterio"`
	Apontamentos int    `json:"apontamentos"`
	Aceitas      int    `json:"aceitas"`
	Editadas     int    `json:"editadas"`
	Recusadas    int    `json:"recusadas"`
	Discordancia *int   `json:"discordancia"`
}

// Alertas da auditoria de equidade.
const (
	AlertaVerificarVies = "verificar_vies"
	AlertaOK            = "ok"
	AlertaPoucosDados   = "poucos_dados"
)

// MinimoDecisoes é o número mínimo de decisões para um grupo gerar alerta.
const MinimoDecisoes = 3

type Grupo struct {
	Grupo              string   `json:"grupo"`
	Textos             int      `json:"textos"`
	Palavras           int      `json:"palavras"`
	ApontamentosPor100 *float64 `json:"apontamentos_por_100_palavras"`
	PercentualVariacao *int     `json:"percentual_variacao"`
	Discordancia       *int     `json:"discordancia"`
	Decisoes           int      `json:"decisoes"`
	Alerta             string   `json:"alerta"`
}

type Versao struct {
	AlunoCodigo     string  `json:"aluno_codigo"`
	Titulo          string  `json:"titulo"`
	TextoV1         string  `json:"texto_v1"`
	TextoV2         string  `json:"texto_v2"`
	DesviosV1Por100 float64 `json:"desvios_v1_por_100_palavras"`
	DesviosV2Por100 float64 `json:"desvios_v2_por_100_palavras"`
	Reducao         *int    `json:"reducao"`
}

type Resumo struct {
	DiscordanciaGeral *int       `json:"discordancia_geral"`
	Decididos         int        `json:"apontamentos_decididos"`
	PorCriterio       []Criterio `json:"por_criterio"`
	Equidade          []Grupo    `json:"equidade"`
	Versoes           []Versao   `json:"versoes"`
	ReducaoMedia      *int       `json:"reducao_media"`
	TotalTextos       int        `json:"total_textos"`
	Concluidos        int        `json:"concluidos"`
	LimiarVies        int        `json:"limiar_vies"`
}

// arred arredonda como Math.round do JavaScript (meio para cima).
func arred(x float64) int { return int(math.Floor(x + 0.5)) }

func pct(a, b int) *int {
	if b == 0 {
		return nil
	}
	v := arred(100 * float64(a) / float64(b))
	return &v
}

// discordancia é a parcela dos apontamentos decididos que o professor recusou ou editou.
func discordancia(aps []dominio.Apontamento) (*int, int) {
	dec, disc := 0, 0
	for _, a := range aps {
		if a.Decisao == nil {
			continue
		}
		dec++
		if *a.Decisao != dominio.DecisaoAceita {
			disc++
		}
	}
	return pct(disc, dec), dec
}

func corrigido(t dominio.Texto) bool {
	return t.Status == dominio.StatusRevisao || t.Status == dominio.StatusConcluido
}

// Calcular recebe todos os textos (com apontamentos) e o limiar de alerta de viés.
func Calcular(textos []dominio.Texto, limiarVies int) Resumo {
	r := Resumo{TotalTextos: len(textos), LimiarVies: limiarVies, PorCriterio: []Criterio{}, Equidade: []Grupo{}, Versoes: []Versao{}}
	var corrigidos []dominio.Texto
	var todos []dominio.Apontamento
	for _, t := range textos {
		if t.Status == dominio.StatusConcluido {
			r.Concluidos++
		}
		if corrigido(t) {
			corrigidos = append(corrigidos, t)
			todos = append(todos, t.Apontamentos...)
		}
	}
	r.DiscordanciaGeral, r.Decididos = discordancia(todos)

	// Por critério, na ordem em que aparecem.
	idxCrit := map[string]int{}
	for _, a := range todos {
		if a.Decisao == nil {
			continue
		}
		i, ok := idxCrit[a.Criterio]
		if !ok {
			i = len(r.PorCriterio)
			idxCrit[a.Criterio] = i
			r.PorCriterio = append(r.PorCriterio, Criterio{Criterio: a.Criterio})
		}
		c := &r.PorCriterio[i]
		c.Apontamentos++
		switch *a.Decisao {
		case dominio.DecisaoAceita:
			c.Aceitas++
		case dominio.DecisaoEditada:
			c.Editadas++
		case dominio.DecisaoRecusada:
			c.Recusadas++
		}
	}
	for i := range r.PorCriterio {
		c := &r.PorCriterio[i]
		c.Discordancia = pct(c.Editadas+c.Recusadas, c.Apontamentos)
	}

	// Equidade por perfil sociolinguístico.
	type acum struct {
		textos, palavras int
		aps              []dominio.Apontamento
	}
	porGrupo := map[string]*acum{}
	var ordem []string
	for _, t := range corrigidos {
		g := t.Grupo
		if g == "" {
			g = dominio.GrupoNaoInformado
		}
		a, ok := porGrupo[g]
		if !ok {
			a = &acum{}
			porGrupo[g] = a
			ordem = append(ordem, g)
		}
		a.textos++
		a.palavras += dominio.ContarPalavras(t.Conteudo)
		a.aps = append(a.aps, t.Apontamentos...)
	}
	for _, g := range ordem {
		a := porGrupo[g]
		gr := Grupo{Grupo: g, Textos: a.textos, Palavras: a.palavras}
		if a.palavras > 0 {
			v := 100 * float64(len(a.aps)) / float64(a.palavras)
			v = math.Round(v*10) / 10
			gr.ApontamentosPor100 = &v
		}
		nVar := 0
		for _, ap := range a.aps {
			if ap.Variacao {
				nVar++
			}
		}
		gr.PercentualVariacao = pct(nVar, len(a.aps))
		gr.Discordancia, gr.Decisoes = discordancia(a.aps)
		switch {
		case gr.Decisoes < MinimoDecisoes:
			gr.Alerta = AlertaPoucosDados
		case gr.Discordancia != nil && r.DiscordanciaGeral != nil && *gr.Discordancia-*r.DiscordanciaGeral >= limiarVies:
			gr.Alerta = AlertaVerificarVies
		default:
			gr.Alerta = AlertaOK
		}
		r.Equidade = append(r.Equidade, gr)
	}
	sort.SliceStable(r.Equidade, func(i, j int) bool { return r.Equidade[i].Textos > r.Equidade[j].Textos })

	// Ganho entre versões: desvios validados a cada 100 palavras, v1 × v2.
	porID := map[string]dominio.Texto{}
	for _, t := range textos {
		porID[t.ID] = t
	}
	validados := func(t dominio.Texto) int {
		n := 0
		for _, a := range t.Apontamentos {
			if a.Validado() {
				n++
			}
		}
		return n
	}
	por100 := func(t dominio.Texto) float64 {
		p := dominio.ContarPalavras(t.Conteudo)
		if p < 1 {
			p = 1
		}
		return 100 * float64(validados(t)) / float64(p)
	}
	soma := 0
	for _, v2 := range textos {
		if v2.Versao != 2 || v2.OrigemID == nil || v2.Status != dominio.StatusConcluido {
			continue
		}
		v1, ok := porID[*v2.OrigemID]
		if !ok || v1.Status != dominio.StatusConcluido {
			continue
		}
		d1, d2 := por100(v1), por100(v2)
		ver := Versao{AlunoCodigo: v2.AlunoCodigo, Titulo: v2.Titulo, TextoV1: v1.ID, TextoV2: v2.ID,
			DesviosV1Por100: math.Round(d1*10) / 10, DesviosV2Por100: math.Round(d2*10) / 10}
		if d1 > 0 {
			g := arred(100 * (d1 - d2) / d1)
			ver.Reducao = &g
			soma += g
		}
		r.Versoes = append(r.Versoes, ver)
	}
	if len(r.Versoes) > 0 {
		m := arred(float64(soma) / float64(len(r.Versoes)))
		r.ReducaoMedia = &m
	}
	return r
}
