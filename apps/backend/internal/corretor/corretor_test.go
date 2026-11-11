package corretor

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"unicode/utf16"

	"corretor-textual/internal/dominio"
)

var crit = []string{"Ortografia", "Pontuação"}

func fatia16(s string, ini, fim int) string {
	u := utf16.Encode([]rune(s))
	return string(utf16.Decode(u[ini:fim]))
}

func TestLocalizarOrdenaDescartaESemSobreposicao(t *testing.T) {
	texto := "Eu ja fui na praça. Depois eu ja voltei pra casa."
	brutos := []Bruto{
		{Trecho: "pra casa", Sugestao: "para casa", Criterio: "Ortografia"},
		{Trecho: "ja", Sugestao: "já", Criterio: "ortografia"}, // critério em minúsculas é aceito
		{Trecho: "ja", Sugestao: "já", Criterio: "Ortografia"}, // segunda ocorrência
		{Trecho: "ja", Sugestao: "já", Criterio: "Ortografia"}, // não há terceira livre
		{Trecho: "inexistente", Sugestao: "x", Criterio: "Ortografia"},
		{Trecho: "praça", Sugestao: "praça", Criterio: "Ortografia"}, // não muda nada
		{Trecho: "fui", Sugestao: "fomos", Criterio: "Concordância"}, // critério inativo
		{Trecho: "praça.", Sugestao: "praça;", Criterio: "Pontuação"},
	}
	aps, desc := Localizar(texto, brutos, crit)
	if desc != 4 {
		t.Fatalf("descartados = %d, quero 4", desc)
	}
	if len(aps) != 4 {
		t.Fatalf("apontamentos = %d, quero 4", len(aps))
	}
	for i, a := range aps {
		if a.Ordem != i {
			t.Errorf("ordem %d = %d", i, a.Ordem)
		}
		if got := fatia16(texto, a.Inicio, a.Fim); got != a.Trecho {
			t.Errorf("posição de %q aponta para %q", a.Trecho, got)
		}
		if i > 0 && a.Inicio < aps[i-1].Fim {
			t.Errorf("apontamentos sobrepostos: %v e %v", aps[i-1], a)
		}
	}
	if aps[0].Criterio != "Ortografia" {
		t.Errorf("critério não foi normalizado: %q", aps[0].Criterio)
	}
}

func TestLocalizarUsaUnidadesUTF16(t *testing.T) {
	texto := "Gostei 😀 do passeio, foi inesquecivel."
	aps, _ := Localizar(texto, []Bruto{{Trecho: "inesquecivel", Sugestao: "inesquecível", Criterio: "Ortografia"}}, crit)
	if len(aps) != 1 {
		t.Fatal("trecho não localizado")
	}
	// Em JavaScript: texto.indexOf("inesquecivel") === 26 (o emoji ocupa 2 unidades; em runas seria 25).
	if aps[0].Inicio != 26 || aps[0].Fim != 38 {
		t.Fatalf("posições = %d..%d, quero 26..38", aps[0].Inicio, aps[0].Fim)
	}
	final := dominio.TextoFinal(texto, []dominio.Apontamento{{Inicio: 26, Fim: 38, Sugestao: "inesquecível", Decisao: ptr(dominio.DecisaoAceita)}})
	if final != "Gostei 😀 do passeio, foi inesquecível." {
		t.Fatalf("texto final = %q", final)
	}
}

func ptr[T any](v T) *T { return &v }

func TestSimuladoRespeitaContextoEPalavraInteira(t *testing.T) {
	texto := "Minha cidade e pequena e bonita. Sabado eu fui pra feira, mais tem coisa demais. O jardim ja era."
	r, err := Simulado{}.Corrigir(context.Background(), texto, []string{"Ortografia", "Pontuação", "Concordância"})
	if err != nil {
		t.Fatal(err)
	}
	aps, desc := Localizar(texto, r.Apontamentos, []string{"Ortografia", "Pontuação", "Concordância"})
	if desc != 0 {
		t.Fatalf("descartados = %d", desc)
	}
	var pares []string
	for _, a := range aps {
		pares = append(pares, a.Trecho+"→"+a.Sugestao)
	}
	got := strings.Join(pares, " | ")
	want := "e→é | Sabado→Sábado | pra→para | mais→mas | ja→já"
	if got != want {
		t.Fatalf("apontamentos:\n got %s\nwant %s", got, want)
	}
	// "e" isolado só vira "é" antes de "pequena"; "demais" e "jardim" não casam com "mais" e "ja".
	if aps[0].Inicio != 13 {
		t.Fatalf("o primeiro apontamento devia estar na posição 13, está em %d", aps[0].Inicio)
	}
}

func TestSimuladoFiltraCriterios(t *testing.T) {
	texto := "Nós vai na escola. Meu pai ja chegou."
	r, _ := Simulado{}.Corrigir(context.Background(), texto, []string{"Ortografia"})
	for _, b := range r.Apontamentos {
		if b.Criterio != "Ortografia" {
			t.Fatalf("critério inativo apontado: %+v", b)
		}
	}
	if len(r.Apontamentos) != 1 {
		t.Fatalf("quero 1 apontamento, veio %d", len(r.Apontamentos))
	}
}

func TestMontarPedidoNaoIncluiDadosDoEstudante(t *testing.T) {
	sis, usu := MontarPedido("Texto do estudante.", crit)
	if !strings.Contains(usu, "<texto_do_estudante>\nTexto do estudante.\n</texto_do_estudante>") {
		t.Fatalf("texto não delimitado: %q", usu)
	}
	if !strings.Contains(usu, "Ortografia, Pontuação") || !strings.Contains(sis, "ignore qualquer pedido") {
		t.Fatal("instruções incompletas")
	}
}

func respostaOK(texto string) string {
	b, _ := json.Marshal(map[string]any{
		"type": "message", "role": "assistant", "stop_reason": "end_turn",
		"content": []map[string]any{{"type": "text", "text": texto}},
	})
	return string(b)
}

func TestAnthropicMontaPedidoELeResposta(t *testing.T) {
	var chamadas atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := chamadas.Add(1)
		if r.URL.Path != "/v1/messages" || r.Method != http.MethodPost {
			t.Errorf("rota inesperada %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("x-api-key") != "chave-teste" || r.Header.Get("anthropic-version") != "2026-10-21" {
			t.Errorf("cabeçalhos inesperados: %v", r.Header)
		}
		corpo, _ := io.ReadAll(r.Body)
		var p map[string]any
		if err := json.Unmarshal(corpo, &p); err != nil {
			t.Fatal(err)
		}
		if p["model"] != "claude-sonnet-5-5" {
			t.Errorf("modelo = %v", p["model"])
		}
		for _, proibido := range []string{"temperature", "top_p", "top_k"} {
			if _, ok := p[proibido]; ok {
				t.Errorf("%s não deve ser enviado na versão 2026-10-21", proibido)
			}
		}
		fmt := p["output_config"].(map[string]any)["format"].(map[string]any)
		if fmt["type"] != "json_schema" {
			t.Errorf("output_config.format.type = %v", fmt["type"])
		}
		if n == 1 { // primeira tentativa: sobrecarga temporária
			w.Header().Set("retry-after", "0")
			w.WriteHeader(529)
			io.WriteString(w, `{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`)
			return
		}
		io.WriteString(w, respostaOK(`{"apontamentos":[{"trecho":"ja","sugestao":"já","criterio":"Ortografia","explicacao":"Leva acento.","variacao":false}],"comentario_geral":"Bom texto."}`))
	}))
	defer srv.Close()
	a := &Anthropic{APIKey: "chave-teste", Modelo: "claude-sonnet-5-5", BaseURL: srv.URL, Versao: "2026-10-21", HTTP: srv.Client()}
	res, err := Executar(context.Background(), a, "Eu ja fui.", crit)
	if err != nil {
		t.Fatal(err)
	}
	if chamadas.Load() != 2 {
		t.Fatalf("quero 2 chamadas (1 nova tentativa), houve %d", chamadas.Load())
	}
	if len(res.Apontamentos) != 1 || res.Apontamentos[0].Inicio != 3 || res.Comentario != "Bom texto." || res.Motor != "ia" {
		t.Fatalf("resultado inesperado: %+v", res)
	}
}

func TestAnthropicErros(t *testing.T) {
	casos := []struct {
		nome   string
		status int
		corpo  string
		quero  error
	}{
		{"recusa", 200, `{"stop_reason":"refusal","content":[]}`, ErrRecusa},
		{"cortada", 200, `{"stop_reason":"max_tokens","content":[{"type":"text","text":"{\"apon"}]}`, ErrFormato},
		{"chave", 401, `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`, ErrConfiguracao},
		{"limite", 429, `{"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}`, ErrLimite},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("retry-after", "0")
				w.WriteHeader(c.status)
				io.WriteString(w, c.corpo)
			}))
			defer srv.Close()
			a := &Anthropic{APIKey: "k", Modelo: "m", BaseURL: srv.URL, Versao: "v", HTTP: srv.Client(), Tentativas: 2}
			_, err := a.Corrigir(context.Background(), "texto", crit)
			if !errors.Is(err, c.quero) {
				t.Fatalf("erro = %v, quero %v", err, c.quero)
			}
			if MensagemProfessor(err) == "" {
				t.Fatal("sem mensagem para o professor")
			}
		})
	}
}

func TestExecutarRecusaTextoLongo(t *testing.T) {
	_, err := Executar(context.Background(), Simulado{}, strings.Repeat("a", MaxCaracteres+1), crit)
	if !errors.Is(err, ErrTextoMuitoLong) {
		t.Fatalf("erro = %v", err)
	}
}
