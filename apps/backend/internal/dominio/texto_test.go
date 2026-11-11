package dominio

import "testing"

func d(v Decisao) *Decisao { return &v }
func s(v string) *string   { return &v }

func TestTextoFinalESegmentos(t *testing.T) {
	c := "Eu ja fui pra praça mais voltei."
	aps := []Apontamento{
		{Inicio: 3, Fim: 5, Trecho: "ja", Sugestao: "já", Decisao: d(DecisaoAceita)},
		{Inicio: 10, Fim: 13, Trecho: "pra", Sugestao: "para", Decisao: d(DecisaoRecusada)},
		{Inicio: 20, Fim: 24, Trecho: "mais", Sugestao: "mas", Decisao: d(DecisaoEditada), SugestaoFinal: s(", mas")},
	}
	if got := TextoFinal(c, aps); got != "Eu já fui pra praça , mas voltei." {
		t.Fatalf("texto final = %q", got)
	}
	seg := Segmentar(c, aps)
	if len(seg) != 5 || seg[1].Tipo != "correcao" || seg[1].Correcao != "já" || seg[3].Correcao != ", mas" {
		t.Fatalf("segmentos inesperados: %+v", seg)
	}
	if seg[2].Texto != " fui pra praça " { // recusado volta como texto original
		t.Fatalf("segmento do meio = %q", seg[2].Texto)
	}
}

func TestContarPalavras(t *testing.T) {
	if n := ContarPalavras("Arco-íris, d'água e 2 sóis!"); n != 5 {
		t.Fatalf("palavras = %d", n)
	}
}
