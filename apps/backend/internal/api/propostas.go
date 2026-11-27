package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"corretor-textual/internal/dominio"
	"corretor-textual/internal/store"
)

const (
	maxTurmasProposta = 10
	maxEnunciado      = 4000
)

type entradaProposta struct {
	Tema      *string   `json:"tema"`
	Genero    *string   `json:"genero"`
	Enunciado *string   `json:"enunciado"`
	Turmas    *[]string `json:"turmas"`
	// Prazo: "AAAA-MM-DD", "" ou null para remover. Ausente = não muda.
	Prazo     json.RawMessage `json:"prazo"`
	Encerrada *bool           `json:"encerrada"`
}

// validarProposta limpa os campos presentes e devolve o primeiro erro de validação.
func validarProposta(in *entradaProposta) *erroValidacao {
	if in.Tema != nil {
		t := strings.TrimSpace(*in.Tema)
		if len([]rune(t)) < 3 || len([]rune(t)) > 200 {
			return invalido("tema_invalido", "Informe um tema de 3 a 200 caracteres.")
		}
		in.Tema = &t
	}
	if in.Genero != nil && !slices.Contains(dominio.GenerosTextuais, *in.Genero) {
		return invalido("genero_invalido", "Gênero textual desconhecido. Use um dos gêneros da lista.")
	}
	if in.Enunciado != nil {
		e := strings.TrimSpace(*in.Enunciado)
		if len([]rune(e)) > maxEnunciado {
			return invalido("enunciado_longo", "O enunciado aceita até 4000 caracteres.")
		}
		in.Enunciado = &e
	}
	if in.Turmas != nil {
		var turmas []string
		for _, t := range *in.Turmas {
			t = strings.TrimSpace(t)
			if t == "" || slices.Contains(turmas, t) {
				continue
			}
			if len([]rune(t)) > 30 {
				return invalido("turma_invalida", "Cada turma aceita até 30 caracteres.")
			}
			turmas = append(turmas, t)
		}
		if len(turmas) == 0 || len(turmas) > maxTurmasProposta {
			return invalido("turmas_invalidas", "Informe de 1 a 10 turmas.")
		}
		in.Turmas = &turmas
	}
	return nil
}

// lerPrazo interpreta o campo prazo: ausente (mudar=false), nulo/vazio (remover) ou data.
func lerPrazo(bruto json.RawMessage) (prazo *string, mudar bool, erro *erroValidacao) {
	if len(bruto) == 0 {
		return nil, false, nil
	}
	var v *string
	if err := json.Unmarshal(bruto, &v); err != nil {
		return nil, true, invalido("prazo_invalido", "Informe o prazo como data (AAAA-MM-DD).")
	}
	if v == nil || strings.TrimSpace(*v) == "" {
		return nil, true, nil
	}
	data := strings.TrimSpace(*v)
	if _, err := time.Parse(time.DateOnly, data); err != nil {
		return nil, true, invalido("prazo_invalido", "Informe o prazo como data (AAAA-MM-DD).")
	}
	return &data, true, nil
}

func (s *Servidor) listarPropostas(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var filtro *bool
	switch r.URL.Query().Get("situacao") {
	case "", "todas":
	case "abertas":
		f := false
		filtro = &f
	case "encerradas":
		f := true
		filtro = &f
	default:
		falha(w, http.StatusBadRequest, "situacao_invalida", "Use situacao abertas, encerradas ou todas.")
		return
	}
	ps, err := s.st.ListarPropostas(r.Context(), filtro)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, map[string]any{"propostas": ps, "generos": dominio.GenerosTextuais})
}

func (s *Servidor) obterProposta(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	p, err := s.st.BuscarProposta(r.Context(), r.PathValue("id"))
	if err != nil {
		s.falhaProposta(w, r, err)
		return
	}
	escrever(w, http.StatusOK, p)
}

func (s *Servidor) criarProposta(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in entradaProposta
	if !lerJSON(w, r, &in) {
		return
	}
	if in.Tema == nil || in.Genero == nil || in.Turmas == nil {
		falha(w, http.StatusUnprocessableEntity, "campos_obrigatorios", "Informe o tema, o gênero textual e ao menos uma turma.")
		return
	}
	if e := validarProposta(&in); e != nil {
		falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
		return
	}
	prazo, _, e := lerPrazo(in.Prazo)
	if e != nil {
		falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
		return
	}
	p := dominio.Proposta{Tema: *in.Tema, Genero: *in.Genero, Turmas: *in.Turmas, Prazo: prazo, CriadoPor: &u.ID}
	if in.Enunciado != nil {
		p.Enunciado = *in.Enunciado
	}
	p, err := s.st.CriarProposta(r.Context(), p)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "criar_proposta", "proposta", p.ID, "turmas="+strconv.Itoa(len(p.Turmas)))
	escrever(w, http.StatusCreated, p)
}

func (s *Servidor) alterarProposta(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in entradaProposta
	if !lerJSON(w, r, &in) {
		return
	}
	if e := validarProposta(&in); e != nil {
		falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
		return
	}
	prazo, mudarPrazo, e := lerPrazo(in.Prazo)
	if e != nil {
		falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
		return
	}
	alt := store.AlteracaoProposta{Tema: in.Tema, Genero: in.Genero, Enunciado: in.Enunciado, Encerrada: in.Encerrada}
	if in.Turmas != nil {
		alt.Turmas = *in.Turmas
	}
	if mudarPrazo {
		alt.Prazo, alt.LimparPrazo = prazo, prazo == nil
	}
	id := r.PathValue("id")
	p, err := s.st.AtualizarProposta(r.Context(), id, alt)
	if err != nil {
		s.falhaProposta(w, r, err)
		return
	}
	var mudou []string
	for campo, presente := range map[string]bool{"tema": in.Tema != nil, "genero": in.Genero != nil, "enunciado": in.Enunciado != nil, "turmas": in.Turmas != nil, "prazo": mudarPrazo} {
		if presente {
			mudou = append(mudou, campo)
		}
	}
	slices.Sort(mudou)
	if in.Encerrada != nil {
		mudou = append(mudou, "encerrada="+strconv.FormatBool(*in.Encerrada))
	}
	s.auditar(r, &u, "alterar_proposta", "proposta", id, strings.Join(mudou, " "))
	escrever(w, http.StatusOK, p)
}

func (s *Servidor) excluirProposta(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	id := r.PathValue("id")
	if err := s.st.ExcluirProposta(r.Context(), id); err != nil {
		s.falhaProposta(w, r, err)
		return
	}
	s.auditar(r, &u, "excluir_proposta", "proposta", id, "")
	w.WriteHeader(http.StatusNoContent)
}

// falhaProposta traduz os erros do banco com a concordância certa ("encontrada").
func (s *Servidor) falhaProposta(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, store.ErrNaoEncontrado) {
		falha(w, http.StatusNotFound, "nao_encontrado", "Proposta não encontrada.")
		return
	}
	s.falhaStore(w, r, err, "Proposta")
}
