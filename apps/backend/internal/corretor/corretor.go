// Package corretor gera os apontamentos de correção de um texto,
// com a Claude API ou com regras de demonstração.
package corretor

import (
	"context"
	"errors"
	"sort"
	"strings"

	"corretor-textual/internal/dominio"
)

// MaxCaracteres limita o tamanho de um texto enviado à correção.
const MaxCaracteres = 20000

// Bruto é um apontamento como o motor o devolve, antes de ser localizado no texto.
type Bruto struct {
	Trecho     string `json:"trecho"`
	Sugestao   string `json:"sugestao"`
	Criterio   string `json:"criterio"`
	Explicacao string `json:"explicacao"`
	Variacao   bool   `json:"variacao"`

	// posicao em bytes, quando o motor já sabe onde o trecho está (-1 ou 0 = desconhecida).
	posicao int
	temPos  bool
}

// Resposta é a saída de um motor.
type Resposta struct {
	Apontamentos    []Bruto `json:"apontamentos"`
	ComentarioGeral string  `json:"comentario_geral"`
}

// Motor corrige um texto segundo os critérios ativos.
// O motor recebe só o texto e os critérios: código do estudante, turma e
// perfil sociolinguístico nunca saem do servidor.
type Motor interface {
	Nome() string
	Corrigir(ctx context.Context, texto string, criterios []string) (Resposta, error)
}

// Erros que o motor pode devolver. A API traduz cada um para o professor.
var (
	ErrRecusa         = errors.New("a IA recusou este texto")
	ErrFormato        = errors.New("a IA respondeu fora do formato esperado")
	ErrLimite         = errors.New("limite de uso da IA atingido")
	ErrIndisponivel   = errors.New("a IA está indisponível no momento")
	ErrConfiguracao   = errors.New("a chave ou o modelo da IA estão incorretos")
	ErrTextoMuitoLong = errors.New("o texto é longo demais para uma correção")
)

// Resultado é a correção pronta para gravar.
type Resultado struct {
	Motor        string
	Criterios    []string
	Apontamentos []dominio.Apontamento
	Comentario   string
	Descartados  int
}

// Executar roda o motor e localiza os apontamentos no texto.
func Executar(ctx context.Context, m Motor, texto string, criterios []string) (Resultado, error) {
	if len([]rune(texto)) > MaxCaracteres {
		return Resultado{}, ErrTextoMuitoLong
	}
	resp, err := m.Corrigir(ctx, texto, criterios)
	if err != nil {
		return Resultado{}, err
	}
	aps, desc := Localizar(texto, resp.Apontamentos, criterios)
	return Resultado{
		Motor:        m.Nome(),
		Criterios:    append([]string(nil), criterios...),
		Apontamentos: aps,
		Comentario:   strings.TrimSpace(resp.ComentarioGeral),
		Descartados:  desc,
	}, nil
}

type faixa struct{ ini, fim int }

func sobrepoe(fs []faixa, ini, fim int) bool {
	for _, f := range fs {
		if ini < f.fim && f.ini < fim {
			return true
		}
	}
	return false
}

// Localizar encontra cada trecho no texto e devolve os apontamentos em ordem,
// sem sobreposição, com posições em unidades UTF-16. Apontamentos que não
// correspondem a um trecho do texto, que não mudam nada ou que fogem dos
// critérios ativos são descartados.
func Localizar(texto string, brutos []Bruto, criterios []string) ([]dominio.Apontamento, int) {
	canon := map[string]string{}
	for _, c := range criterios {
		canon[strings.ToLower(c)] = c
	}
	type achado struct {
		b        Bruto
		ini, fim int
		criterio string
	}
	var achados []achado
	var ocupadas []faixa
	descartados := 0
	cursor := 0
	for _, b := range brutos {
		crit, ok := canon[strings.ToLower(strings.TrimSpace(b.Criterio))]
		if b.Trecho == "" || b.Trecho == b.Sugestao || !ok {
			descartados++
			continue
		}
		ini := -1
		if b.temPos && b.posicao >= 0 && b.posicao+len(b.Trecho) <= len(texto) && texto[b.posicao:b.posicao+len(b.Trecho)] == b.Trecho {
			ini = b.posicao
		}
		if ini < 0 {
			if i := strings.Index(texto[cursor:], b.Trecho); i >= 0 {
				ini = cursor + i
			}
		}
		if ini >= 0 && sobrepoe(ocupadas, ini, ini+len(b.Trecho)) {
			ini = -1
		}
		if ini < 0 {
			// Procura do início uma ocorrência livre.
			for de := 0; de <= len(texto); {
				i := strings.Index(texto[de:], b.Trecho)
				if i < 0 {
					break
				}
				c := de + i
				if !sobrepoe(ocupadas, c, c+len(b.Trecho)) {
					ini = c
					break
				}
				de = c + 1
			}
		}
		if ini < 0 {
			descartados++
			continue
		}
		fim := ini + len(b.Trecho)
		ocupadas = append(ocupadas, faixa{ini, fim})
		achados = append(achados, achado{b, ini, fim, crit})
		cursor = fim
	}
	sort.SliceStable(achados, func(i, j int) bool { return achados[i].ini < achados[j].ini })
	out := make([]dominio.Apontamento, 0, len(achados))
	for i, a := range achados {
		ini16 := dominio.TamanhoUTF16(texto[:a.ini])
		out = append(out, dominio.Apontamento{
			Ordem:      i,
			Criterio:   a.criterio,
			Trecho:     a.b.Trecho,
			Inicio:     ini16,
			Fim:        ini16 + dominio.TamanhoUTF16(a.b.Trecho),
			Sugestao:   a.b.Sugestao,
			Explicacao: strings.TrimSpace(a.b.Explicacao),
			Variacao:   a.b.Variacao,
		})
	}
	return out, descartados
}
