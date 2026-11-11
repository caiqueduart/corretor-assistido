package api

import (
	"encoding/csv"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"corretor-textual/internal/auth"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/metricas"
	"corretor-textual/internal/store"
)

// ---------- configuração ----------

func (s *Servidor) obterConfig(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, map[string]any{
		"configuracao":          cfg,
		"criterios_disponiveis": dominio.CriteriosDisponiveis,
		"ia_configurada":        s.ia != nil,
	})
}

func (s *Servidor) salvarConfig(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Criterios  []string `json:"criterios"`
		Grupos     []string `json:"grupos"`
		LimiarVies int      `json:"limiar_vies"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	cfg := dominio.Configuracao{LimiarVies: in.LimiarVies}
	// Mantém a ordem canônica dos critérios.
	for _, c := range dominio.CriteriosDisponiveis {
		if slices.Contains(in.Criterios, c.ID) {
			cfg.Criterios = append(cfg.Criterios, c.ID)
		}
	}
	if len(cfg.Criterios) == 0 || len(cfg.Criterios) != len(in.Criterios) {
		falha(w, http.StatusUnprocessableEntity, "criterios_invalidos", "Escolha ao menos um critério entre Ortografia, Pontuação, Concordância e Maiúsculas, sem repetir.")
		return
	}
	vistos := map[string]bool{}
	cfg.Grupos = []string{dominio.GrupoNaoInformado}
	vistos[strings.ToLower(dominio.GrupoNaoInformado)] = true
	for _, g := range in.Grupos {
		g = strings.TrimSpace(g)
		if g == "" || vistos[strings.ToLower(g)] {
			continue
		}
		if len([]rune(g)) > 60 {
			falha(w, http.StatusUnprocessableEntity, "grupo_invalido", "Cada perfil sociolinguístico aceita até 60 caracteres.")
			return
		}
		vistos[strings.ToLower(g)] = true
		cfg.Grupos = append(cfg.Grupos, g)
	}
	if len(cfg.Grupos) > 30 {
		falha(w, http.StatusUnprocessableEntity, "grupo_invalido", "Use no máximo 30 perfis sociolinguísticos.")
		return
	}
	if cfg.LimiarVies < 5 || cfg.LimiarVies > 50 {
		falha(w, http.StatusUnprocessableEntity, "limiar_invalido", "O alerta de viés deve ficar entre 5 e 50 pontos percentuais.")
		return
	}
	if err := s.st.SalvarConfiguracao(r.Context(), cfg, &u.ID); err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "alterar_config", "configuracao", "1",
		"criterios="+strings.Join(cfg.Criterios, ",")+" limiar="+strconv.Itoa(cfg.LimiarVies))
	s.obterConfig(w, r, u)
}

// ---------- usuários ----------

func (s *Servidor) listarUsuarios(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	us, err := s.st.ListarUsuarios(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, map[string]any{"usuarios": us})
}

func emailValido(e string) bool {
	i := strings.Index(e, "@")
	return i > 0 && i < len(e)-1 && !strings.ContainsAny(e, " \t\n") && len(e) <= 254
}

func (s *Servidor) criarUsuario(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Nome   string         `json:"nome"`
		Email  string         `json:"email"`
		Senha  string         `json:"senha"`
		Perfil dominio.Perfil `json:"perfil"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	in.Nome, in.Email = strings.TrimSpace(in.Nome), strings.TrimSpace(in.Email)
	switch {
	case in.Nome == "" || len([]rune(in.Nome)) > 100:
		falha(w, http.StatusUnprocessableEntity, "nome_invalido", "Informe um nome com até 100 caracteres.")
		return
	case !emailValido(in.Email):
		falha(w, http.StatusUnprocessableEntity, "email_invalido", "Informe um e-mail válido.")
		return
	case !in.Perfil.Valido():
		falha(w, http.StatusUnprocessableEntity, "perfil_invalido", "Use perfil admin, professor ou leitura.")
		return
	}
	hash, err := auth.GerarHash(in.Senha)
	if errors.Is(err, auth.ErrSenhaFraca) {
		falha(w, http.StatusUnprocessableEntity, "senha_fraca", primeiraMaiuscula(err.Error())+".")
		return
	}
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	novo, err := s.st.CriarUsuario(r.Context(), dominio.Usuario{Nome: in.Nome, Email: in.Email, Perfil: in.Perfil, Ativo: true}, hash)
	if errors.Is(err, store.ErrEmailEmUso) {
		falha(w, http.StatusConflict, "email_em_uso", "Já existe um usuário com este e-mail.")
		return
	}
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "criar_usuario", "usuario", novo.ID, "perfil="+string(novo.Perfil))
	escrever(w, http.StatusCreated, novo)
}

func (s *Servidor) alterarUsuario(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Nome   *string         `json:"nome"`
		Perfil *dominio.Perfil `json:"perfil"`
		Ativo  *bool           `json:"ativo"`
		Senha  *string         `json:"senha"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	var alt store.AlteracaoUsuario
	if in.Nome != nil {
		n := strings.TrimSpace(*in.Nome)
		if n == "" || len([]rune(n)) > 100 {
			falha(w, http.StatusUnprocessableEntity, "nome_invalido", "Informe um nome com até 100 caracteres.")
			return
		}
		alt.Nome = &n
	}
	if in.Perfil != nil {
		if !in.Perfil.Valido() {
			falha(w, http.StatusUnprocessableEntity, "perfil_invalido", "Use perfil admin, professor ou leitura.")
			return
		}
		alt.Perfil = in.Perfil
	}
	if id == u.ID && ((in.Perfil != nil && *in.Perfil != dominio.PerfilAdmin) || (in.Ativo != nil && !*in.Ativo)) {
		falha(w, http.StatusConflict, "auto_rebaixamento", "Você não pode remover o próprio acesso de administrador.")
		return
	}
	alt.Ativo = in.Ativo
	if in.Senha != nil {
		h, err := auth.GerarHash(*in.Senha)
		if errors.Is(err, auth.ErrSenhaFraca) {
			falha(w, http.StatusUnprocessableEntity, "senha_fraca", primeiraMaiuscula(err.Error())+".")
			return
		}
		if err != nil {
			s.falhaInterna(w, r, err)
			return
		}
		alt.SenhaHash = &h
	}
	atual, err := s.st.AtualizarUsuario(r.Context(), id, alt)
	if err != nil {
		s.falhaStore(w, r, err, "Usuário")
		return
	}
	var mudou []string
	if alt.Nome != nil {
		mudou = append(mudou, "nome")
	}
	if alt.Perfil != nil {
		mudou = append(mudou, "perfil="+string(*alt.Perfil))
	}
	if alt.Ativo != nil {
		mudou = append(mudou, "ativo="+strconv.FormatBool(*alt.Ativo))
	}
	if alt.SenhaHash != nil {
		mudou = append(mudou, "senha")
	}
	s.auditar(r, &u, "alterar_usuario", "usuario", id, strings.Join(mudou, " "))
	escrever(w, http.StatusOK, atual)
}

func (s *Servidor) listarAuditoria(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	limite := 100
	if v := r.URL.Query().Get("limite"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 1000 {
			falha(w, http.StatusBadRequest, "limite_invalido", "Use limite entre 1 e 1000.")
			return
		}
		limite = n
	}
	regs, err := s.st.ListarAuditoria(r.Context(), limite)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, map[string]any{"registros": regs})
}

// ---------- métricas ----------

func (s *Servidor) metricas(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	ts, err := s.st.ListarTextosCompletos(r.Context(), store.FiltroTextos{Turma: r.URL.Query().Get("turma")})
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, metricas.Calcular(ts, cfg.LimiarVies))
}

// decisoesCSV exporta uma linha por apontamento decidido, sem o conteúdo dos
// textos nem o código do estudante, para a análise da experimentação.
func (s *Servidor) decisoesCSV(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	ts, err := s.st.ListarTextosCompletos(r.Context(), store.FiltroTextos{Turma: r.URL.Query().Get("turma")})
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="decisoes.csv"`)
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"texto_id", "versao", "turma", "grupo", "motor", "criterio", "variacao", "decisao", "decidido_em"})
	for _, t := range ts {
		for _, a := range t.Apontamentos {
			if a.Decisao == nil {
				continue
			}
			em := ""
			if a.DecididoEm != nil {
				em = a.DecididoEm.Format("2006-01-02T15:04:05Z")
			}
			_ = cw.Write([]string{t.ID, strconv.Itoa(t.Versao), t.Turma, t.Grupo, t.Motor, a.Criterio,
				strconv.FormatBool(a.Variacao), string(*a.Decisao), em})
		}
	}
	cw.Flush()
}
