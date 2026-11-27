package api

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"corretor-textual/internal/auth"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/store"
)

const maxCodigosPorVez = 60

type pedidoCodigo struct {
	AlunoCodigo string `json:"aluno_codigo"`
	Turma       string `json:"turma"`
	Grupo       string `json:"grupo"`
}

type codigoGerado struct {
	AlunoCodigo string `json:"aluno_codigo"`
	Turma       string `json:"turma"`
	Codigo      string `json:"codigo"`
}

// gerarCodigos cria (ou recria) o código de acesso de cada aluno. Os códigos só
// aparecem nesta resposta: no banco fica apenas o hash.
func (s *Servidor) gerarCodigos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Alunos        []pedidoCodigo `json:"alunos"`
		Consentimento bool           `json:"consentimento"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	if !in.Consentimento {
		falha(w, http.StatusUnprocessableEntity, "consentimento_obrigatorio", "Confirme o consentimento informado das famílias antes de liberar o envio pelos alunos.")
		return
	}
	if len(in.Alunos) == 0 || len(in.Alunos) > maxCodigosPorVez {
		falha(w, http.StatusUnprocessableEntity, "alunos_invalidos", "Informe de 1 a 60 alunos por vez.")
		return
	}
	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	for i := range in.Alunos {
		a := &in.Alunos[i]
		a.AlunoCodigo, a.Turma, a.Grupo = strings.TrimSpace(a.AlunoCodigo), strings.TrimSpace(a.Turma), strings.TrimSpace(a.Grupo)
		if a.Grupo == "" {
			a.Grupo = dominio.GrupoNaoInformado
		}
		switch {
		case a.AlunoCodigo == "" || len([]rune(a.AlunoCodigo)) > 40:
			falha(w, http.StatusUnprocessableEntity, "aluno_invalido", "Cada aluno precisa de um apelido de até 40 caracteres.")
			return
		case a.Turma == "" || len([]rune(a.Turma)) > 30:
			falha(w, http.StatusUnprocessableEntity, "turma_invalida", "Informe a turma (até 30 caracteres) de cada aluno.")
			return
		case !slices.Contains(cfg.Grupos, a.Grupo):
			falha(w, http.StatusUnprocessableEntity, "grupo_invalido", "Perfil sociolinguístico desconhecido. Use um dos perfis da configuração.")
			return
		}
	}
	gerados := make([]codigoGerado, 0, len(in.Alunos))
	for _, a := range in.Alunos {
		codigo, err := auth.GerarCodigoAcesso()
		if err != nil {
			s.falhaInterna(w, r, err)
			return
		}
		c := dominio.CodigoAcesso{AlunoCodigo: a.AlunoCodigo, Turma: a.Turma, Grupo: a.Grupo}
		if _, err := s.st.GravarCodigo(r.Context(), c, auth.HashCodigo(codigo), &u.ID); err != nil {
			s.falhaInterna(w, r, err)
			return
		}
		gerados = append(gerados, codigoGerado{a.AlunoCodigo, a.Turma, codigo})
	}
	s.auditar(r, &u, "gerar_codigos", "codigo", "", "alunos="+strconv.Itoa(len(gerados)))
	escrever(w, http.StatusCreated, map[string]any{"codigos": gerados})
}

func (s *Servidor) listarCodigos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	cs, err := s.st.ListarCodigos(r.Context(), r.URL.Query().Get("turma"))
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, map[string]any{"codigos": cs})
}

func (s *Servidor) revogarCodigo(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	aluno := r.PathValue("aluno")
	if err := s.st.RevogarCodigo(r.Context(), aluno); err != nil {
		if errors.Is(err, store.ErrNaoEncontrado) {
			falha(w, http.StatusNotFound, "nao_encontrado", "Este aluno não tem código ativo.")
			return
		}
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "revogar_codigo", "codigo", aluno, "")
	w.WriteHeader(http.StatusNoContent)
}
