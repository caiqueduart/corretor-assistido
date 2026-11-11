// Package api expõe a API HTTP (JSON) do Corretor Textual.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"strings"
	"sync"
	"time"

	"corretor-textual/internal/auth"
	"corretor-textual/internal/config"
	"corretor-textual/internal/corretor"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/store"
)

type Servidor struct {
	st        *store.Store
	cfg       config.Config
	log       *slog.Logger
	ia        corretor.Motor // nil quando a chave da API não está configurada
	simulado  corretor.Motor
	fila      chan struct{}
	ctx       context.Context
	cancelar  context.CancelFunc
	jobs      sync.WaitGroup
	limitador *auth.Limitador
	mux       *http.ServeMux
}

// Novo monta o servidor. ia pode ser nil (só a correção simulada fica disponível).
func Novo(st *store.Store, cfg config.Config, log *slog.Logger, ia corretor.Motor) *Servidor {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Servidor{
		st: st, cfg: cfg, log: log, ia: ia, simulado: corretor.Simulado{},
		fila: make(chan struct{}, cfg.CorrecaoConcorrencia), ctx: ctx, cancelar: cancel,
		limitador: auth.NovoLimitador(5, 15*time.Minute),
		mux:       http.NewServeMux(),
	}
	s.rotas()
	return s
}

// Encerrar interrompe as correções em andamento e espera que terminem.
func (s *Servidor) Encerrar(ctx context.Context) {
	s.cancelar()
	fim := make(chan struct{})
	go func() { s.jobs.Wait(); close(fim) }()
	select {
	case <-fim:
	case <-ctx.Done():
	}
}

func (s *Servidor) Handler() http.Handler {
	return s.recuperar(s.registrar(s.cors(s.mux)))
}

type manipulador func(w http.ResponseWriter, r *http.Request, u dominio.Usuario)

var (
	todos      = []dominio.Perfil{dominio.PerfilAdmin, dominio.PerfilProfessor, dominio.PerfilLeitura}
	escritores = []dominio.Perfil{dominio.PerfilAdmin, dominio.PerfilProfessor}
	admins     = []dominio.Perfil{dominio.PerfilAdmin}
)

func (s *Servidor) rotas() {
	m := s.mux
	m.HandleFunc("GET /healthz", s.saude)

	m.HandleFunc("POST /api/auth/login", s.login)
	m.Handle("POST /api/auth/logout", s.com(todos, s.logout))
	m.Handle("GET /api/me", s.com(todos, s.eu))

	m.Handle("GET /api/config", s.com(todos, s.obterConfig))
	m.Handle("PUT /api/config", s.com(admins, s.salvarConfig))

	m.Handle("GET /api/usuarios", s.com(admins, s.listarUsuarios))
	m.Handle("POST /api/usuarios", s.com(admins, s.criarUsuario))
	m.Handle("PATCH /api/usuarios/{id}", s.com(admins, s.alterarUsuario))
	m.Handle("GET /api/auditoria", s.com(admins, s.listarAuditoria))

	m.Handle("GET /api/textos", s.com(todos, s.listarTextos))
	m.Handle("POST /api/textos", s.com(escritores, s.criarTexto))
	m.Handle("POST /api/textos/importar", s.com(escritores, s.importarTextos))
	m.Handle("POST /api/textos/exemplos", s.com(escritores, s.carregarExemplos))
	m.Handle("DELETE /api/textos/exemplos", s.com(escritores, s.removerExemplos))
	m.Handle("GET /api/textos/{id}", s.com(todos, s.obterTexto))
	m.Handle("DELETE /api/textos/{id}", s.com(escritores, s.excluirTexto))
	m.Handle("POST /api/textos/{id}/corrigir", s.com(escritores, s.corrigir))
	m.Handle("PATCH /api/textos/{id}/apontamentos/{aid}", s.com(escritores, s.decidir))
	m.Handle("POST /api/textos/{id}/decisoes", s.com(escritores, s.decidirTodos))
	m.Handle("PUT /api/textos/{id}/comentario", s.com(escritores, s.comentar))
	m.Handle("POST /api/textos/{id}/enviar", s.com(escritores, s.enviar))
	m.Handle("GET /api/textos/{id}/devolutiva", s.com(todos, s.devolutiva))

	m.Handle("GET /api/metricas", s.com(todos, s.metricas))
	m.Handle("GET /api/metricas/decisoes.csv", s.com(todos, s.decisoesCSV))

	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		falha(w, http.StatusNotFound, "rota_inexistente", "Rota não encontrada.")
	})
	if s.cfg.DirEstatico != "" {
		m.Handle("/", http.FileServer(http.Dir(s.cfg.DirEstatico)))
	}
}

// ---------- respostas ----------

type corpoErro struct {
	Erro struct {
		Codigo   string `json:"codigo"`
		Mensagem string `json:"mensagem"`
	} `json:"erro"`
}

func escrever(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func falha(w http.ResponseWriter, status int, codigo, mensagem string) {
	var c corpoErro
	c.Erro.Codigo, c.Erro.Mensagem = codigo, mensagem
	escrever(w, status, c)
}

func (s *Servidor) falhaInterna(w http.ResponseWriter, r *http.Request, err error) {
	s.log.Error("erro interno", "metodo", r.Method, "rota", r.URL.Path, "erro", err)
	falha(w, http.StatusInternalServerError, "erro_interno", "Ocorreu um erro inesperado. Tente de novo.")
}

// falhaStore traduz os erros do banco.
func (s *Servidor) falhaStore(w http.ResponseWriter, r *http.Request, err error, oQue string) {
	var conf store.ErrConflito
	switch {
	case errors.Is(err, store.ErrNaoEncontrado):
		falha(w, http.StatusNotFound, "nao_encontrado", oQue+" não encontrado.")
	case errors.As(err, &conf):
		falha(w, http.StatusConflict, "estado_invalido", conf.Motivo)
	default:
		s.falhaInterna(w, r, err)
	}
}

const maxCorpoJSON = 1 << 20

// lerJSON decodifica o corpo e responde 400 em caso de erro.
func lerJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	return decodificar(w, r, dst, false)
}

// lerJSONOpcional aceita corpo vazio.
func lerJSONOpcional(w http.ResponseWriter, r *http.Request, dst any) bool {
	return decodificar(w, r, dst, true)
}

func decodificar(w http.ResponseWriter, r *http.Request, dst any, vazioOK bool) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxCorpoJSON)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		if vazioOK && errors.Is(err, io.EOF) {
			return true
		}
		msg := "Corpo da requisição inválido: " + err.Error()
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			msg = "Corpo da requisição grande demais."
		}
		falha(w, http.StatusBadRequest, "json_invalido", msg)
		return false
	}
	return true
}

// ---------- middleware ----------

type chaveCtx struct{}

// quem guarda o usuário da requisição para o registro de acesso.
type quem struct{ id string }

type chaveQuem struct{}

func (s *Servidor) com(perfis []dominio.Perfil, h manipulador) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || strings.TrimSpace(token) == "" {
			falha(w, http.StatusUnauthorized, "nao_autenticado", "Faça login para continuar.")
			return
		}
		u, err := s.st.BuscarSessao(r.Context(), auth.HashToken(strings.TrimSpace(token)))
		if errors.Is(err, store.ErrNaoEncontrado) {
			falha(w, http.StatusUnauthorized, "sessao_expirada", "Sua sessão expirou. Faça login de novo.")
			return
		}
		if err != nil {
			s.falhaInterna(w, r, err)
			return
		}
		if !slices.Contains(perfis, u.Perfil) {
			falha(w, http.StatusForbidden, "sem_permissao", "Seu perfil não permite esta ação.")
			return
		}
		if q, ok := r.Context().Value(chaveQuem{}).(*quem); ok {
			q.id = u.ID
		}
		r = r.WithContext(context.WithValue(r.Context(), chaveCtx{}, u))
		h(w, r, u)
	})
}

type gravador struct {
	http.ResponseWriter
	status int
}

func (g *gravador) WriteHeader(c int) { g.status = c; g.ResponseWriter.WriteHeader(c) }

func (s *Servidor) registrar(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inicio := time.Now()
		g := &gravador{ResponseWriter: w, status: http.StatusOK}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		q := &quem{}
		next.ServeHTTP(g, r.WithContext(context.WithValue(r.Context(), chaveQuem{}, q)))
		attrs := []any{"metodo", r.Method, "rota", r.URL.Path, "status", g.status, "duracao_ms", time.Since(inicio).Milliseconds()}
		if q.id != "" {
			attrs = append(attrs, "usuario", q.id)
		}
		s.log.Info("requisicao", attrs...)
	})
}

func (s *Servidor) recuperar(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				s.log.Error("pânico", "erro", v, "pilha", string(debug.Stack()))
				falha(w, http.StatusInternalServerError, "erro_interno", "Ocorreu um erro inesperado. Tente de novo.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Servidor) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origem := r.Header.Get("Origin")
		if origem != "" && (slices.Contains(s.cfg.CORSOrigens, origem) || slices.Contains(s.cfg.CORSOrigens, "*")) {
			w.Header().Set("Access-Control-Allow-Origin", origem)
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Servidor) auditar(r *http.Request, u *dominio.Usuario, acao, entidade, id, detalhe string) {
	var uid *string
	if u != nil {
		uid = &u.ID
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	if err := s.st.Auditar(ctx, uid, acao, entidade, id, detalhe); err != nil {
		s.log.Error("falha ao registrar auditoria", "acao", acao, "erro", err)
	}
}

// ---------- saúde e autenticação ----------

func (s *Servidor) saude(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.st.Ping(ctx); err != nil {
		falha(w, http.StatusServiceUnavailable, "banco_indisponivel", "O banco de dados não respondeu.")
		return
	}
	escrever(w, http.StatusOK, map[string]any{"status": "ok", "ia_configurada": s.ia != nil})
}

func (s *Servidor) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
		Senha string `json:"senha"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	chave := strings.ToLower(strings.TrimSpace(in.Email))
	if !s.limitador.Permitido(chave) {
		falha(w, http.StatusTooManyRequests, "muitas_tentativas", "Muitas tentativas com senha errada. Aguarde 15 minutos e tente de novo.")
		return
	}
	u, hash, err := s.st.BuscarUsuarioPorEmail(r.Context(), chave)
	if err != nil && !errors.Is(err, store.ErrNaoEncontrado) {
		s.falhaInterna(w, r, err)
		return
	}
	ok := auth.ConferirSenha(in.Senha, hash) && err == nil && u.Ativo
	if !ok {
		s.limitador.Falhou(chave)
		falha(w, http.StatusUnauthorized, "credenciais_invalidas", "E-mail ou senha incorretos.")
		return
	}
	s.limitador.Limpar(chave)
	token, hashTok, err := auth.NovoToken()
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	expira := time.Now().Add(s.cfg.SessaoDuracao).UTC()
	if err := s.st.CriarSessao(r.Context(), hashTok, u.ID, expira); err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "login", "usuario", u.ID, "")
	escrever(w, http.StatusOK, map[string]any{"token": token, "expira_em": expira, "usuario": u})
}

func (s *Servidor) logout(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if err := s.st.RemoverSessao(r.Context(), auth.HashToken(token)); err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Servidor) eu(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	escrever(w, http.StatusOK, u)
}
