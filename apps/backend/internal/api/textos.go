package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"corretor-textual/internal/corretor"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/exemplos"
	"corretor-textual/internal/extracao"
	"corretor-textual/internal/store"
)

// ---------- criação e importação ----------

type novoTexto struct {
	AlunoCodigo   string `json:"aluno_codigo"`
	Turma         string `json:"turma"`
	Grupo         string `json:"grupo"`
	Titulo        string `json:"titulo"`
	Conteudo      string `json:"conteudo"`
	OrigemID      string `json:"origem_id"`
	Consentimento bool   `json:"consentimento"`
}

type erroValidacao struct {
	Codigo   string `json:"codigo"`
	Mensagem string `json:"mensagem"`
}

func (e *erroValidacao) Error() string { return e.Mensagem }

func invalido(codigo, msg string) *erroValidacao { return &erroValidacao{codigo, msg} }

func excede(campo, valor string, max int) *erroValidacao {
	if len([]rune(valor)) > max {
		return invalido("campo_longo", fmt.Sprintf("O campo %s aceita até %d caracteres.", campo, max))
	}
	return nil
}

// preparar valida os dados e monta o texto a gravar.
func (s *Servidor) preparar(ctx context.Context, n novoTexto, cfg dominio.Configuracao, u dominio.Usuario) (dominio.Texto, error) {
	if !n.Consentimento {
		return dominio.Texto{}, invalido("consentimento_obrigatorio", "Registre o consentimento informado da família para incluir o texto na experimentação.")
	}
	t := dominio.Texto{
		AlunoCodigo:   strings.TrimSpace(n.AlunoCodigo),
		Turma:         strings.TrimSpace(n.Turma),
		Grupo:         strings.TrimSpace(n.Grupo),
		Titulo:        strings.TrimSpace(n.Titulo),
		Conteudo:      extracao.Normalizar(n.Conteudo),
		Versao:        1,
		Status:        dominio.StatusPendente,
		Consentimento: true,
		CriadoPor:     &u.ID,
	}
	if t.Conteudo == "" {
		return t, invalido("conteudo_vazio", "O texto está vazio.")
	}
	if len([]rune(t.Conteudo)) > corretor.MaxCaracteres {
		return t, invalido("texto_longo", fmt.Sprintf("O texto passa de %d caracteres. Divida em partes.", corretor.MaxCaracteres))
	}
	if origemID := strings.TrimSpace(n.OrigemID); origemID != "" {
		o, err := s.st.BuscarTexto(ctx, origemID, false)
		if errors.Is(err, store.ErrNaoEncontrado) {
			return t, invalido("origem_invalida", "O texto de origem da reescrita não existe.")
		}
		if err != nil {
			return t, err
		}
		if o.Versao != 1 {
			return t, invalido("origem_invalida", "A reescrita deve apontar para a 1ª versão do texto.")
		}
		if t.AlunoCodigo != "" && t.AlunoCodigo != o.AlunoCodigo {
			return t, invalido("aluno_divergente", "A reescrita precisa ser do mesmo estudante da 1ª versão.")
		}
		t.AlunoCodigo, t.Grupo, t.Versao, t.OrigemID = o.AlunoCodigo, o.Grupo, 2, &o.ID
		if t.Turma == "" {
			t.Turma = o.Turma
		}
		if t.Titulo == "" {
			t.Titulo = o.Titulo
		}
	}
	if t.AlunoCodigo == "" {
		return t, invalido("aluno_obrigatorio", "Informe o código do estudante. Use um código, nunca o nome.")
	}
	for _, e := range []*erroValidacao{excede("aluno_codigo", t.AlunoCodigo, 40), excede("turma", t.Turma, 30), excede("titulo", t.Titulo, 120)} {
		if e != nil {
			return t, e
		}
	}
	if t.Grupo == "" {
		t.Grupo = dominio.GrupoNaoInformado
	}
	if !slices.Contains(cfg.Grupos, t.Grupo) {
		return t, invalido("grupo_invalido", "Perfil sociolinguístico desconhecido. Use um dos perfis da configuração.")
	}
	return t, nil
}

func (s *Servidor) responderValidacao(w http.ResponseWriter, r *http.Request, err error) {
	var ev *erroValidacao
	if errors.As(err, &ev) {
		falha(w, http.StatusUnprocessableEntity, ev.Codigo, ev.Mensagem)
		return
	}
	s.falhaInterna(w, r, err)
}

func (s *Servidor) criarTexto(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var n novoTexto
	if !lerJSON(w, r, &n) {
		return
	}
	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	t, err := s.preparar(r.Context(), n, cfg, u)
	if err != nil {
		s.responderValidacao(w, r, err)
		return
	}
	t, err = s.st.CriarTexto(r.Context(), t)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "criar_texto", "texto", t.ID, fmt.Sprintf("versao=%d origem=colado", t.Versao))
	escrever(w, http.StatusCreated, t)
}

const maxArquivos = 20

type erroArquivo struct {
	Arquivo  string `json:"arquivo"`
	Mensagem string `json:"mensagem"`
}

func valorBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "on", "sim", "s":
		return true
	}
	return false
}

// importarTextos recebe multipart/form-data com um ou mais "arquivos" (PDF, TXT ou DOCX)
// e os campos aluno_codigo, turma, grupo, titulo, origem_id e consentimento.
func (s *Servidor) importarTextos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	maxArq := int64(s.cfg.MaxUploadMB) << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxArq*maxArquivos+(1<<20))
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			falha(w, http.StatusRequestEntityTooLarge, "upload_grande", "O envio passou do tamanho permitido.")
			return
		}
		falha(w, http.StatusBadRequest, "multipart_invalido", "Envie os arquivos como multipart/form-data no campo \"arquivos\".")
		return
	}
	defer r.MultipartForm.RemoveAll()
	arquivos := r.MultipartForm.File["arquivos"]
	if len(arquivos) == 0 {
		falha(w, http.StatusBadRequest, "sem_arquivos", "Nenhum arquivo enviado no campo \"arquivos\".")
		return
	}
	if len(arquivos) > maxArquivos {
		falha(w, http.StatusBadRequest, "arquivos_demais", fmt.Sprintf("Envie no máximo %d arquivos por vez.", maxArquivos))
		return
	}
	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	base := novoTexto{
		AlunoCodigo:   r.FormValue("aluno_codigo"),
		Turma:         r.FormValue("turma"),
		Grupo:         r.FormValue("grupo"),
		Titulo:        r.FormValue("titulo"),
		OrigemID:      r.FormValue("origem_id"),
		Consentimento: valorBool(r.FormValue("consentimento")),
	}
	if !base.Consentimento {
		falha(w, http.StatusUnprocessableEntity, "consentimento_obrigatorio", "Registre o consentimento informado da família para incluir os textos na experimentação.")
		return
	}
	criados := []dominio.Texto{}
	erros := []erroArquivo{}
	for _, fh := range arquivos {
		nome := filepath.Base(fh.Filename)
		if fh.Size > maxArq {
			erros = append(erros, erroArquivo{nome, fmt.Sprintf("O arquivo passa de %d MB.", s.cfg.MaxUploadMB)})
			continue
		}
		f, err := fh.Open()
		if err != nil {
			erros = append(erros, erroArquivo{nome, "Não foi possível abrir o arquivo."})
			continue
		}
		dados, err := io.ReadAll(io.LimitReader(f, maxArq+1))
		f.Close()
		if err != nil {
			erros = append(erros, erroArquivo{nome, "Não foi possível ler o arquivo."})
			continue
		}
		conteudo, err := extracao.Extrair(nome, dados)
		if err != nil {
			erros = append(erros, erroArquivo{nome, primeiraMaiuscula(err.Error()) + "."})
			continue
		}
		n := base
		n.Conteudo = conteudo
		if strings.TrimSpace(n.AlunoCodigo) == "" && n.OrigemID == "" {
			// Com o código em branco, o nome do arquivo vira o código do estudante.
			n.AlunoCodigo = strings.TrimSuffix(nome, filepath.Ext(nome))
		}
		t, err := s.preparar(r.Context(), n, cfg, u)
		if err != nil {
			var ev *erroValidacao
			if errors.As(err, &ev) {
				erros = append(erros, erroArquivo{nome, ev.Mensagem})
				continue
			}
			s.falhaInterna(w, r, err)
			return
		}
		t, err = s.st.CriarTexto(r.Context(), t)
		if err != nil {
			s.falhaInterna(w, r, err)
			return
		}
		s.auditar(r, &u, "criar_texto", "texto", t.ID, fmt.Sprintf("versao=%d origem=%s", t.Versao, strings.TrimPrefix(strings.ToLower(filepath.Ext(nome)), ".")))
		criados = append(criados, t)
	}
	status := http.StatusCreated
	if len(criados) == 0 {
		status = http.StatusUnprocessableEntity
	}
	escrever(w, status, map[string]any{"criados": criados, "erros": erros})
}

func primeiraMaiuscula(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0])) + string(r[1:])
}

func (s *Servidor) carregarExemplos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	n, err := exemplos.Carregar(r.Context(), s.st, &u.ID)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "carregar_exemplos", "texto", "", strconv.Itoa(n))
	escrever(w, http.StatusOK, map[string]int{"criados": n})
}

func (s *Servidor) removerExemplos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	n, err := s.st.ExcluirExemplos(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	s.auditar(r, &u, "remover_exemplos", "texto", "", strconv.Itoa(n))
	escrever(w, http.StatusOK, map[string]int{"removidos": n})
}

// ---------- leitura ----------

func (s *Servidor) listarTextos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	q := r.URL.Query()
	f := store.FiltroTextos{Status: q.Get("status"), Turma: q.Get("turma"), Grupo: q.Get("grupo"), AlunoCodigo: q.Get("aluno")}
	if f.Status != "" && !dominio.Status(f.Status).Valido() {
		falha(w, http.StatusBadRequest, "status_invalido", "Use status pendente, corrigindo, revisao ou concluido.")
		return
	}
	ts, err := s.st.ListarTextos(r.Context(), f)
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	escrever(w, http.StatusOK, map[string]any{"textos": ts})
}

func (s *Servidor) obterTexto(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	t, err := s.st.BuscarTexto(r.Context(), r.PathValue("id"), true)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	escrever(w, http.StatusOK, t)
}

func (s *Servidor) excluirTexto(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	id := r.PathValue("id")
	if err := s.st.ExcluirTexto(r.Context(), id); err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	s.auditar(r, &u, "excluir_texto", "texto", id, "")
	w.WriteHeader(http.StatusNoContent)
}

// ---------- correção ----------

func (s *Servidor) corrigir(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Motor string `json:"motor"`
	}
	if !lerJSONOpcional(w, r, &in) {
		return
	}
	var m corretor.Motor
	switch in.Motor {
	case "":
		m = s.ia
		if m == nil {
			m = s.simulado
		}
	case dominio.MotorIA:
		if s.ia == nil {
			falha(w, http.StatusUnprocessableEntity, "ia_nao_configurada", "A correção por IA não está configurada neste servidor. Use o motor \"simulado\" ou configure ANTHROPIC_API_KEY.")
			return
		}
		m = s.ia
	case dominio.MotorSimulado:
		m = s.simulado
	default:
		falha(w, http.StatusBadRequest, "motor_invalido", "Use motor \"ia\" ou \"simulado\".")
		return
	}
	cfg, err := s.st.ObterConfiguracao(r.Context())
	if err != nil {
		s.falhaInterna(w, r, err)
		return
	}
	t, err := s.st.IniciarCorrecao(r.Context(), r.PathValue("id"))
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	pronto := s.agendarCorrecao(t, m, cfg.Criterios, u)
	if !valorBool(r.URL.Query().Get("aguardar")) {
		escrever(w, http.StatusAccepted, t)
		return
	}
	select {
	case <-pronto:
	case <-r.Context().Done():
		return
	}
	t, err = s.st.BuscarTexto(context.WithoutCancel(r.Context()), t.ID, true)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	escrever(w, http.StatusOK, t)
}

// agendarCorrecao roda a correção em segundo plano, respeitando o limite de
// correções simultâneas. O canal devolvido fecha quando ela termina.
func (s *Servidor) agendarCorrecao(t dominio.Texto, m corretor.Motor, criterios []string, u dominio.Usuario) <-chan struct{} {
	pronto := make(chan struct{})
	s.jobs.Add(1)
	go func() {
		defer s.jobs.Done()
		defer close(pronto)
		bg := func() (context.Context, context.CancelFunc) {
			return context.WithTimeout(context.Background(), 10*time.Second)
		}
		falhar := func(msg string) {
			ctx, cancel := bg()
			defer cancel()
			if err := s.st.FalharCorrecao(ctx, t.ID, msg); err != nil {
				s.log.Error("falha ao registrar erro de correção", "texto", t.ID, "erro", err)
			}
		}
		defer func() {
			if v := recover(); v != nil {
				s.log.Error("pânico na correção", "texto", t.ID, "erro", v)
				falhar("A correção falhou. Tente de novo em instantes.")
			}
		}()
		select {
		case s.fila <- struct{}{}:
			defer func() { <-s.fila }()
		case <-s.ctx.Done():
			falhar("A correção foi interrompida. Tente de novo.")
			return
		}
		ctx, cancel := context.WithTimeout(s.ctx, s.cfg.CorrecaoTimeout)
		defer cancel()
		inicio := time.Now()
		res, err := corretor.Executar(ctx, m, t.Conteudo, criterios)
		dur := time.Since(inicio).Round(time.Millisecond)
		if err != nil {
			s.log.Warn("correção falhou", "texto", t.ID, "motor", m.Nome(), "duracao", dur.String(), "erro", err)
			falhar(corretor.MensagemProfessor(err))
			return
		}
		ctxS, cancelS := bg()
		defer cancelS()
		err = s.st.SalvarCorrecao(ctxS, t.ID, store.ResultadoCorrecao{
			Motor: res.Motor, Criterios: res.Criterios, Apontamentos: res.Apontamentos,
			Comentario: res.Comentario, Descartados: res.Descartados,
		})
		if errors.Is(err, store.ErrNaoEncontrado) {
			s.log.Info("texto excluído durante a correção", "texto", t.ID)
			return
		}
		if err != nil {
			s.log.Error("falha ao gravar correção", "texto", t.ID, "erro", err)
			falhar("A correção terminou, mas não foi possível gravá-la. Tente de novo.")
			return
		}
		s.log.Info("correção concluída", "texto", t.ID, "motor", res.Motor, "apontamentos", len(res.Apontamentos), "descartados", res.Descartados, "duracao", dur.String())
		if err := s.st.Auditar(ctxS, &u.ID, "corrigir", "texto", t.ID,
			fmt.Sprintf("motor=%s apontamentos=%d descartados=%d duracao=%s", res.Motor, len(res.Apontamentos), res.Descartados, dur)); err != nil {
			s.log.Error("falha ao registrar auditoria", "erro", err)
		}
	}()
	return pronto
}

// ---------- revisão do professor ----------

func (s *Servidor) decidir(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Decisao       json.RawMessage `json:"decisao"`
		SugestaoFinal *string         `json:"sugestao_final"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	if len(in.Decisao) == 0 {
		falha(w, http.StatusBadRequest, "decisao_obrigatoria", "Informe a decisão: aceita, recusada, editada ou null para desfazer.")
		return
	}
	textoID, apID := r.PathValue("id"), r.PathValue("aid")
	var dec *dominio.Decisao
	var final *string
	if string(in.Decisao) != "null" {
		var d dominio.Decisao
		if err := json.Unmarshal(in.Decisao, &d); err != nil || !d.Valida() {
			falha(w, http.StatusBadRequest, "decisao_invalida", "Use decisao aceita, recusada, editada ou null.")
			return
		}
		dec = &d
		if d == dominio.DecisaoEditada {
			if in.SugestaoFinal == nil {
				falha(w, http.StatusUnprocessableEntity, "sugestao_final_obrigatoria", "Para editar, envie a sua correção em sugestao_final.")
				return
			}
			if e := excede("sugestao_final", *in.SugestaoFinal, 500); e != nil {
				falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
				return
			}
			t, err := s.st.BuscarTexto(r.Context(), textoID, true)
			if err != nil {
				s.falhaStore(w, r, err, "Texto")
				return
			}
			i := slices.IndexFunc(t.Apontamentos, func(a dominio.Apontamento) bool { return a.ID == apID })
			if i < 0 {
				falha(w, http.StatusNotFound, "nao_encontrado", "Apontamento não encontrado.")
				return
			}
			if *in.SugestaoFinal == t.Apontamentos[i].Sugestao {
				// Editar para o mesmo texto da sugestão equivale a aceitar.
				aceita := dominio.DecisaoAceita
				dec = &aceita
			} else {
				final = in.SugestaoFinal
			}
		}
	}
	a, err := s.st.Decidir(r.Context(), textoID, apID, dec, final, u.ID)
	if err != nil {
		s.falhaStore(w, r, err, "Apontamento")
		return
	}
	t, err := s.st.BuscarTexto(r.Context(), textoID, false)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	escrever(w, http.StatusOK, map[string]any{"apontamento": a, "pendentes": t.Pendentes})
}

func (s *Servidor) decidirTodos(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Decisao dominio.Decisao `json:"decisao"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	if in.Decisao != dominio.DecisaoAceita && in.Decisao != dominio.DecisaoRecusada {
		falha(w, http.StatusBadRequest, "decisao_invalida", "Para decidir toda a correção, use aceita ou recusada.")
		return
	}
	id := r.PathValue("id")
	n, err := s.st.DecidirTodos(r.Context(), id, in.Decisao, u.ID)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	s.auditar(r, &u, "decidir_todos", "texto", id, fmt.Sprintf("decisao=%s apontamentos=%d", in.Decisao, n))
	t, err := s.st.BuscarTexto(r.Context(), id, true)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	escrever(w, http.StatusOK, t)
}

func (s *Servidor) comentar(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Comentario string `json:"comentario"`
	}
	if !lerJSON(w, r, &in) {
		return
	}
	if e := excede("comentario", in.Comentario, 2000); e != nil {
		falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
		return
	}
	if err := s.st.AtualizarComentario(r.Context(), r.PathValue("id"), strings.TrimSpace(in.Comentario)); err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Servidor) enviar(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	var in struct {
		Comentario *string `json:"comentario"`
	}
	if !lerJSONOpcional(w, r, &in) {
		return
	}
	if in.Comentario != nil {
		c := strings.TrimSpace(*in.Comentario)
		if e := excede("comentario", c, 2000); e != nil {
			falha(w, http.StatusUnprocessableEntity, e.Codigo, e.Mensagem)
			return
		}
		in.Comentario = &c
	}
	id := r.PathValue("id")
	if err := s.st.Enviar(r.Context(), id, in.Comentario, u.ID); err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	s.auditar(r, &u, "enviar_devolutiva", "texto", id, "")
	t, err := s.st.BuscarTexto(r.Context(), id, true)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	escrever(w, http.StatusOK, t)
}

type itemReescrita struct {
	Criterio   string `json:"criterio"`
	Trecho     string `json:"trecho"`
	Correcao   string `json:"correcao"`
	Explicacao string `json:"explicacao"`
}

// devolutiva devolve o que o estudante recebe: só os apontamentos que o professor validou.
func (s *Servidor) devolutiva(w http.ResponseWriter, r *http.Request, u dominio.Usuario) {
	t, err := s.st.BuscarTexto(r.Context(), r.PathValue("id"), true)
	if err != nil {
		s.falhaStore(w, r, err, "Texto")
		return
	}
	if t.Status != dominio.StatusConcluido {
		falha(w, http.StatusConflict, "devolutiva_nao_enviada", "A devolutiva só fica disponível depois que o professor revisa e envia.")
		return
	}
	itens := []itemReescrita{}
	for _, a := range t.Apontamentos {
		if a.Validado() {
			itens = append(itens, itemReescrita{a.Criterio, a.Trecho, a.Correcao(), a.Explicacao})
		}
	}
	escrever(w, http.StatusOK, map[string]any{
		"texto_id":        t.ID,
		"aluno_codigo":    t.AlunoCodigo,
		"titulo":          t.Titulo,
		"versao":          t.Versao,
		"enviado_em":      t.EnviadoEm,
		"comentario":      t.ComentarioProfessor,
		"texto_corrigido": dominio.TextoFinal(t.Conteudo, t.Apontamentos),
		"segmentos":       dominio.Segmentar(t.Conteudo, t.Apontamentos),
		"para_reescrita":  itens,
	})
}
