package api

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"slices"
	"strings"

	"corretor-textual/internal/auth"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/extracao"
	"corretor-textual/internal/store"
)

// Rotas públicas do aluno: sem login, só com o código de acesso. Devolvem o
// mínimo necessário (apelido, propostas abertas da turma, as próprias entregas
// e devolutivas já enviadas pelo professor).

type propostaAluno struct {
	ID        string        `json:"id"`
	Tema      string        `json:"tema"`
	Genero    string        `json:"genero"`
	Enunciado string        `json:"enunciado"`
	Prazo     *string       `json:"prazo"`
	Entrega   *entregaAluno `json:"entrega"`
}

type entregaAluno struct {
	TextoID      string         `json:"texto_id"`
	Status       dominio.Status `json:"status"`
	PodeReenviar bool           `json:"pode_reenviar"`
	EnviadaEm    any            `json:"enviada_em"`
}

type devolutivaResumo struct {
	TextoID   string `json:"texto_id"`
	Titulo    string `json:"titulo"`
	EnviadoEm any    `json:"enviado_em"`
}

// ipDe usa só o endereço da conexão (sem confiar em cabeçalhos do cliente).
func ipDe(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// codigoDoAluno valida o código com limite de tentativas erradas por IP.
func (s *Servidor) codigoDoAluno(w http.ResponseWriter, r *http.Request, codigo string) (dominio.CodigoAcesso, bool) {
	chave := "aluno:" + ipDe(r)
	if !s.limitadorAluno.Permitido(chave) {
		falha(w, http.StatusTooManyRequests, "muitas_tentativas", "Muitas tentativas com código errado. Aguarde 15 minutos e tente de novo.")
		return dominio.CodigoAcesso{}, false
	}
	if strings.TrimSpace(codigo) == "" {
		falha(w, http.StatusUnprocessableEntity, "codigo_obrigatorio", "Digite o seu código de acesso.")
		return dominio.CodigoAcesso{}, false
	}
	c, err := s.st.UsarCodigo(r.Context(), auth.HashCodigo(codigo))
	if errors.Is(err, store.ErrNaoEncontrado) {
		s.limitadorAluno.Falhou(chave)
		falha(w, http.StatusUnauthorized, "codigo_invalido", "Código não encontrado. Confira com o seu professor.")
		return c, false
	}
	if err != nil {
		s.falhaInterna(w, r, err)
		return c, false
	}
	s.limitadorAluno.Limpar(chave)
	return c, true
}

func (s *Servidor) acessoAluno(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Codigo string `json:"codigo"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	c, ok := s.codigoDoAluno(w, r, in.Codigo)
	if !ok {
		return
	}
	abertas := false
	ps, err := s.st.ListarPropostas(r.Context(), &abertas)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	textos, err := s.st.ListarTextos(r.Context(), store.FiltroTextos{AlunoCodigo: c.AlunoCodigo})
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	propostas := []propostaAluno{}
	for _, p := range ps {
		if !slices.Contains(p.Turmas, c.Turma) {
			continue
		}
		pa := propostaAluno{ID: p.ID, Tema: p.Tema, Genero: p.Genero, Enunciado: p.Enunciado, Prazo: p.Prazo}
		for _, t := range textos {
			if t.PropostaID != nil && *t.PropostaID == p.ID {
				pa.Entrega = &entregaAluno{TextoID: t.ID, Status: t.Status, PodeReenviar: t.Status == dominio.StatusPendente, EnviadaEm: t.CriadoEm}
				break
			}
		}
		propostas = append(propostas, pa)
	}
	devolutivas := []devolutivaResumo{}
	for _, t := range textos {
		if t.Status == dominio.StatusConcluido {
			devolutivas = append(devolutivas, devolutivaResumo{t.ID, t.Titulo, t.EnviadoEm})
		}
	}
	escrever(w, http.StatusOK, map[string]any{
		"aluno":       c.AlunoCodigo,
		"turma":       c.Turma,
		"propostas":   propostas,
		"devolutivas": devolutivas,
	})
}

// entregaDoAluno recebe o texto colado (JSON) ou um arquivo (multipart, campo "arquivo").
func (s *Servidor) entregaDoAluno(w http.ResponseWriter, r *http.Request) {
	var codigo, propostaID, conteudo string
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		maxArq := int64(s.cfg.MaxUploadMB) << 20
		r.Body = http.MaxBytesReader(w, r.Body, maxArq+(1<<20))
		if err := r.ParseMultipartForm(maxArq); err != nil {
			falha(w, http.StatusBadRequest, "multipart_invalido", "Não foi possível ler o arquivo enviado.")
			return
		}
		defer r.MultipartForm.RemoveAll()
		codigo, propostaID = r.FormValue("codigo"), r.FormValue("proposta_id")
		arq, cab, err := r.FormFile("arquivo")
		if err != nil {
			falha(w, http.StatusUnprocessableEntity, "sem_arquivo", "Anexe o arquivo da redação (PDF, TXT ou DOCX).")
			return
		}
		dados, err := io.ReadAll(io.LimitReader(arq, maxArq+1))
		arq.Close()
		if err != nil || int64(len(dados)) > maxArq {
			falha(w, http.StatusRequestEntityTooLarge, "upload_grande", fmt.Sprintf("O arquivo passa de %d MB.", s.cfg.MaxUploadMB))
			return
		}
		conteudo, err = extracao.Extrair(filepath.Base(cab.Filename), dados)
		if err != nil {
			falha(w, http.StatusUnprocessableEntity, "arquivo_invalido", primeiraMaiuscula(err.Error())+".")
			return
		}
	} else {
		var in struct {
			Codigo     string `json:"codigo"`
			PropostaID string `json:"proposta_id"`
			Conteudo   string `json:"conteudo"`
		}
		if !lerJSON(w, r, &in) {
			return
		}
		codigo, propostaID, conteudo = in.Codigo, in.PropostaID, in.Conteudo
	}

	c, ok := s.codigoDoAluno(w, r, codigo)
	if !ok {
		return
	}
	p, err := s.st.BuscarProposta(r.Context(), strings.TrimSpace(propostaID))
	if errors.Is(err, store.ErrNaoEncontrado) || (err == nil && !slices.Contains(p.Turmas, c.Turma)) {
		falha(w, http.StatusUnprocessableEntity, "proposta_invalida", "Esta proposta não é da sua turma.")
		return
	}
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	if p.Encerrada {
		falha(w, http.StatusUnprocessableEntity, "proposta_encerrada", "Esta proposta já foi encerrada pelo professor.")
		return
	}

	// Reenvio: troca o texto enquanto a correção não começou.
	existentes, err := s.st.ListarTextos(r.Context(), store.FiltroTextos{AlunoCodigo: c.AlunoCodigo, PropostaID: p.ID})
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	if len(existentes) > 0 {
		normalizado := extracao.Normalizar(conteudo)
		if normalizado == "" {
			falha(w, http.StatusUnprocessableEntity, "conteudo_vazio", "O texto está vazio.")
			return
		}
		if err := s.st.SubstituirConteudo(r.Context(), existentes[0].ID, normalizado); err != nil {
			s.falhaStore(w, r, err, "Texto")
			return
		}
		s.auditar(r, nil, "reenvio_aluno", "texto", existentes[0].ID, "proposta="+p.ID)
		escrever(w, http.StatusOK, map[string]any{"texto_id": existentes[0].ID, "reenvio": true})
		return
	}

	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	// O consentimento da família foi confirmado pelo professor ao gerar o código.
	n := novoTexto{AlunoCodigo: c.AlunoCodigo, Turma: c.Turma, Grupo: c.Grupo, Conteudo: conteudo, PropostaID: p.ID, Consentimento: true}
	t, err := s.preparar(r.Context(), n, cfg, dominio.Usuario{})
	if err != nil {
		s.responderValidacao(w, r, err)
		return
	}
	t.CriadoPor = nil
	t.Origem = dominio.OrigemAluno
	t, err = s.st.CriarTexto(r.Context(), t)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, nil, "entrega_aluno", "texto", t.ID, "proposta="+p.ID)
	escrever(w, http.StatusCreated, map[string]any{"texto_id": t.ID, "reenvio": false})
}

func (s *Servidor) devolutivaDoAluno(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Codigo  string `json:"codigo"`
		TextoID string `json:"texto_id"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	c, ok := s.codigoDoAluno(w, r, in.Codigo)
	if !ok {
		return
	}
	t, err := s.st.BuscarTexto(r.Context(), in.TextoID, true)
	// Texto de outro aluno responde como inexistente, sem revelar que existe.
	if errors.Is(err, store.ErrNaoEncontrado) || (err == nil && t.AlunoCodigo != c.AlunoCodigo) {
		falha(w, http.StatusNotFound, "nao_encontrado", "Devolutiva não encontrada.")
		return
	}
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	if t.Status != dominio.StatusConcluido {
		falha(w, http.StatusConflict, "devolutiva_nao_enviada", "A devolutiva só aparece depois que o professor revisa e envia.")
		return
	}
	escrever(w, http.StatusOK, montarDevolutiva(t))
}
