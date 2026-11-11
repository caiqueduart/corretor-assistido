package dominio

import (
	"regexp"
	"unicode/utf16"
)

var rePalavra = regexp.MustCompile(`[\p{L}\p{N}'-]+`)

// ContarPalavras conta palavras do mesmo jeito que a interface.
func ContarPalavras(s string) int { return len(rePalavra.FindAllStringIndex(s, -1)) }

// TamanhoUTF16 devolve o comprimento de s em unidades UTF-16.
func TamanhoUTF16(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// TextoFinal aplica as correções validadas (aceitas ou editadas) ao conteúdo.
// Os apontamentos precisam estar em ordem e sem sobreposição.
func TextoFinal(conteudo string, aps []Apontamento) string {
	u := utf16.Encode([]rune(conteudo))
	out := make([]uint16, 0, len(u))
	pos := 0
	for _, a := range aps {
		if a.Inicio < pos || a.Fim > len(u) || a.Inicio > a.Fim {
			continue
		}
		out = append(out, u[pos:a.Inicio]...)
		if a.Validado() {
			out = append(out, utf16.Encode([]rune(a.Correcao()))...)
		} else {
			out = append(out, u[a.Inicio:a.Fim]...)
		}
		pos = a.Fim
	}
	out = append(out, u[pos:]...)
	return string(utf16.Decode(out))
}

// Segmento é um pedaço do texto para exibir a devolutiva ao estudante.
type Segmento struct {
	Tipo     string `json:"tipo"` // "texto" ou "correcao"
	Texto    string `json:"texto,omitempty"`
	Original string `json:"original,omitempty"`
	Correcao string `json:"correcao,omitempty"`
}

// Segmentar divide o conteúdo em trechos originais e correções validadas.
// Apontamentos recusados não aparecem: o estudante só vê o que o professor validou.
func Segmentar(conteudo string, aps []Apontamento) []Segmento {
	u := utf16.Encode([]rune(conteudo))
	dec := func(a, b int) string { return string(utf16.Decode(u[a:b])) }
	var out []Segmento
	pos := 0
	add := func(txt string) {
		if txt == "" {
			return
		}
		if n := len(out); n > 0 && out[n-1].Tipo == "texto" {
			out[n-1].Texto += txt
			return
		}
		out = append(out, Segmento{Tipo: "texto", Texto: txt})
	}
	for _, a := range aps {
		if a.Inicio < pos || a.Fim > len(u) || a.Inicio > a.Fim {
			continue
		}
		add(dec(pos, a.Inicio))
		if a.Validado() {
			out = append(out, Segmento{Tipo: "correcao", Original: dec(a.Inicio, a.Fim), Correcao: a.Correcao()})
		} else {
			add(dec(a.Inicio, a.Fim))
		}
		pos = a.Fim
	}
	add(dec(pos, len(u)))
	return out
}
