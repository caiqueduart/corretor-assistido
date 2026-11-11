package corretor

import (
	"context"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Simulado é o motor de demonstração: aplica uma lista fixa de regras.
// Serve para apresentar a POC sem chave da API e para os testes.
type Simulado struct{}

func (Simulado) Nome() string { return "simulado" }

type regra struct {
	trecho     string // palavra ou expressão procurada (palavra inteira)
	depois     string // contexto que precisa vir logo depois (opcional)
	sugestao   string
	criterio   string
	explicacao string
	variacao   bool
}

const (
	ort  = "Ortografia"
	pont = "Pontuação"
	conc = "Concordância"
)

const explPra = "“Pra” é comum na fala. Em textos formais, prefira “para”."

var regras = []regra{
	{"e", " pequena", "é", ort, "O verbo ser na 3ª pessoa leva acento: é.", false},
	{"mais", " tem", "mas", ort, "Aqui a ideia é de oposição; use a conjunção “mas”. “Mais” indica quantidade.", false},
	{"mais", " vale", "mas", ort, "Aqui a ideia é de oposição; use a conjunção “mas”. “Mais” indica quantidade.", false},
	{"mais", " meu", "mas", ort, "Aqui a ideia é de oposição; use a conjunção “mas”. “Mais” indica quantidade.", false},
	{"mais", " conseguimos", "mas", ort, "Aqui a ideia é de oposição; use a conjunção “mas”. “Mais” indica quantidade.", false},
	{"familias", "", "famílias", ort, "Paroxítona terminada em ditongo: famílias leva acento.", false},
	{"familia", "", "família", ort, "Paroxítona terminada em ditongo: família leva acento.", false},
	{"ate", " tarde", "até", ort, "A preposição “até” é acentuada.", false},
	{"Derrepente", "", "De repente", ort, "“De repente” é escrito em duas palavras.", false},
	{"as vezes", "", "às vezes", ort, "Na locução “às vezes” há crase.", false},
	{"da", " até", "dá", ort, "O verbo dar na 3ª pessoa leva acento: dá.", false},
	{"arco iris", "", "arco-íris", ort, "Palavra composta com hífen e acento: arco-íris.", false},
	{"alguem", "", "alguém", ort, "Oxítona terminada em -em leva acento: alguém.", false},
	{"ninguem", "", "ninguém", ort, "Oxítona terminada em -em leva acento: ninguém.", false},
	{"onibus", "", "ônibus", ort, "Proparoxítona: ônibus leva acento.", false},
	{"sabado", "", "sábado", ort, "Proparoxítona: sábado leva acento.", false},
	{"rapido", "", "rápido", ort, "Proparoxítona: rápido leva acento.", false},
	{"ultimo", "", "último", ort, "Proparoxítona: último leva acento.", false},
	{"angulo", "", "ângulo", ort, "Proparoxítona: ângulo leva acento.", false},
	{"matematica", "", "matemática", ort, "Proparoxítona: matemática leva acento.", false},
	{"historias", "", "histórias", ort, "Paroxítona terminada em ditongo: histórias leva acento.", false},
	{"noticia", "", "notícia", ort, "Paroxítona terminada em ditongo: notícia leva acento.", false},
	{"veterinaria", "", "veterinária", ort, "Paroxítona terminada em ditongo: veterinária.", false},
	{"linguas", "", "línguas", ort, "Paroxítona terminada em ditongo: línguas leva acento.", false},
	{"inesquecivel", "", "inesquecível", ort, "Paroxítona terminada em -l leva acento: inesquecível.", false},
	{"dificil", "", "difícil", ort, "Paroxítona terminada em -l leva acento: difícil.", false},
	{"fregues", "", "freguês", ort, "Oxítona terminada em -es leva acento: freguês.", false},
	{"portugues", "", "português", ort, "Oxítona terminada em -es leva acento: português.", false},
	{"porem", "", "porém", ort, "Oxítona terminada em -em leva acento: porém.", false},
	{"tambem", "", "também", ort, "Oxítona terminada em -em leva acento: também.", false},
	{"alem", "", "além", ort, "Oxítona terminada em -em leva acento: além.", false},
	{"vantajem", "", "vantagem", ort, "Substantivos terminados em -agem são escritos com g: vantagem.", false},
	{"ja", "", "já", ort, "O advérbio “já” é acentuado.", false},
	{"so", " no", "só", ort, "O advérbio “só” é acentuado.", false},
	{"so", " dois", "só", ort, "O advérbio “só” é acentuado.", false},
	{"pra", "", "para", ort, explPra, true},
	{"cê", "", "você", ort, "“Cê” é a forma falada; na escrita formal use “você”.", true},
	{"moro", " a gente", "moro,", pont, "Vírgula para separar a oração adverbial deslocada.", false},
	{"semana", " as", "semana,", pont, "Vírgula depois da expressão de tempo no início da frase.", false},
	{"terra,", " quando", "terra;", pont, "Duas ideias independentes: ponto e vírgula ou ponto deixam a leitura mais clara.", false},
	{"falar", " a comida", "falar,", pont, "Vírgula para separar os itens de uma enumeração.", false},
	{"coreto,", " as vezes", "coreto;", pont, "Duas ideias independentes: use ponto e vírgula ou ponto.", false},
	{"opinião", " o", "opinião,", pont, "Vírgula depois da expressão que introduz a opinião.", false},
	{"escola", " mas", "escola,", pont, "Antes de “mas”, que indica oposição, use vírgula.", false},
	{"Nós vai", "", "Nós vamos", conc, "Na norma-padrão, “nós” pede o verbo na 1ª pessoa do plural.", true},
	{"nós chega", "", "nós chegamos", conc, "Na norma-padrão, “nós” pede o verbo na 1ª pessoa do plural.", true},
	{"dos bicho", "", "dos bichos", conc, "Na norma-padrão, todas as palavras do grupo vão para o plural.", true},
	{"dos animal", "", "dos animais", conc, "Na norma-padrão, todas as palavras do grupo vão para o plural.", true},
	{"Meus colega", "", "Meus colegas", conc, "Na norma-padrão, todas as palavras do grupo vão para o plural.", true},
}

func (Simulado) Corrigir(ctx context.Context, texto string, criterios []string) (Resposta, error) {
	ativos := map[string]bool{}
	for _, c := range criterios {
		ativos[c] = true
	}
	var achados []Bruto
	for _, r := range regras {
		if !ativos[r.criterio] {
			continue
		}
		variantes := [][2]string{{r.trecho, r.sugestao}}
		if mai := capitalizar(r.trecho); mai != r.trecho {
			variantes = append(variantes, [2]string{mai, capitalizar(r.sugestao)})
		}
		for _, v := range variantes {
			for _, pos := range ocorrencias(texto, v[0], r.depois) {
				achados = append(achados, Bruto{
					Trecho: v[0], Sugestao: v[1], Criterio: r.criterio,
					Explicacao: r.explicacao, Variacao: r.variacao,
					posicao: pos, temPos: true,
				})
			}
		}
	}
	sort.SliceStable(achados, func(i, j int) bool { return achados[i].posicao < achados[j].posicao })
	// Remove sobreposições mantendo o primeiro.
	var sem []Bruto
	fim := -1
	for _, a := range achados {
		if a.posicao >= fim {
			sem = append(sem, a)
			fim = a.posicao + len(a.Trecho)
		}
	}
	return Resposta{
		Apontamentos:    sem,
		ComentarioGeral: "Seu texto apresenta as ideias com clareza e boas descrições. Revise os pontos marcados para deixá-lo adequado a um texto formal.",
	}, ctx.Err()
}

func capitalizar(s string) string {
	r, n := utf8.DecodeRuneInString(s)
	if r == utf8.RuneError || !unicode.IsLower(r) {
		return s
	}
	return string(unicode.ToUpper(r)) + s[n:]
}

func ehLetra(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

// ocorrencias devolve as posições (em bytes) de trecho como palavra inteira,
// seguido de "depois" quando informado.
func ocorrencias(texto, trecho, depois string) []int {
	var out []int
	primeira, _ := utf8.DecodeRuneInString(trecho)
	ultima, _ := utf8.DecodeLastRuneInString(trecho)
	for de := 0; de < len(texto); {
		i := strings.Index(texto[de:], trecho)
		if i < 0 {
			break
		}
		p := de + i
		f := p + len(trecho)
		de = p + 1
		if ehLetra(primeira) && p > 0 {
			if r, _ := utf8.DecodeLastRuneInString(texto[:p]); ehLetra(r) {
				continue
			}
		}
		if ehLetra(ultima) && f < len(texto) {
			if r, _ := utf8.DecodeRuneInString(texto[f:]); ehLetra(r) {
				continue
			}
		}
		if depois != "" {
			if !strings.HasPrefix(texto[f:], depois) {
				continue
			}
			fd := f + len(depois)
			ud, _ := utf8.DecodeLastRuneInString(depois)
			if ehLetra(ud) && fd < len(texto) {
				if r, _ := utf8.DecodeRuneInString(texto[fd:]); ehLetra(r) {
					continue
				}
			}
		}
		out = append(out, p)
	}
	return out
}
