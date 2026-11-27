package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"corretor-textual/internal/auth"
	"corretor-textual/internal/config"
	"corretor-textual/internal/corretor"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/store"
)

func TestMain(m *testing.M) {
	auth.Iteracoes = 1000 // senhas rápidas nos testes
	os.Exit(m.Run())
}

// iaFalsa simula a Claude API: aponta "ja" e demora um pouco.
type iaFalsa struct{ atraso time.Duration }

func (iaFalsa) Nome() string { return "ia" }

func (f iaFalsa) Corrigir(ctx context.Context, texto string, criterios []string) (corretor.Resposta, error) {
	select {
	case <-time.After(f.atraso):
	case <-ctx.Done():
		return corretor.Resposta{}, ctx.Err()
	}
	r := corretor.Resposta{ComentarioGeral: "Bom texto."}
	if strings.Contains(texto, "ja") {
		r.Apontamentos = append(r.Apontamentos, corretor.Bruto{Trecho: "ja", Sugestao: "já", Criterio: "Ortografia", Explicacao: "Leva acento."})
	}
	return r, nil
}

type cliente struct {
	t   *testing.T
	url string
}

type resposta struct {
	status int
	corpo  map[string]any
	bruto  []byte
}

func (r resposta) erro() string {
	if e, ok := r.corpo["erro"].(map[string]any); ok {
		return fmt.Sprint(e["codigo"])
	}
	return ""
}

func (c cliente) chamar(metodo, rota, token string, corpo any) resposta {
	c.t.Helper()
	var leitor io.Reader
	if corpo != nil {
		b, _ := json.Marshal(corpo)
		leitor = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(metodo, c.url+rota, leitor)
	if corpo != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return c.enviar(req)
}

func (c cliente) enviar(req *http.Request) resposta {
	c.t.Helper()
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	r := resposta{status: res.StatusCode, bruto: b}
	_ = json.Unmarshal(b, &r.corpo)
	return r
}

func (c cliente) login(email, senha string) string {
	c.t.Helper()
	r := c.chamar("POST", "/api/auth/login", "", map[string]string{"email": email, "senha": senha})
	if r.status != 200 {
		c.t.Fatalf("login %s: %d %s", email, r.status, r.bruto)
	}
	return r.corpo["token"].(string)
}

func exigir(t *testing.T, r resposta, status int, contexto string) {
	t.Helper()
	if r.status != status {
		t.Fatalf("%s: status %d, quero %d — %s", contexto, r.status, status, r.bruto)
	}
}

func novoAmbiente(t *testing.T, ia corretor.Motor) (cliente, *store.Store) {
	t.Helper()
	st, err := store.Abrir(filepath.Join(t.TempDir(), "teste.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Fechar() })
	hash, _ := auth.GerarHash("senha-do-admin")
	if _, err := st.CriarUsuario(context.Background(), dominio.Usuario{Nome: "Admin", Email: "admin@escola.test", Perfil: dominio.PerfilAdmin, Ativo: true}, hash); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{CorrecaoConcorrencia: 2, CorrecaoTimeout: 10 * time.Second, SessaoDuracao: time.Hour, MaxUploadMB: 2}
	srv := Novo(st, cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), ia)
	hs := httptest.NewServer(srv.Handler())
	t.Cleanup(func() { hs.Close(); srv.Encerrar(context.Background()) })
	return cliente{t: t, url: hs.URL}, st
}

func docxCom(texto string) []byte {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	f, _ := z.Create("word/document.xml")
	fmt.Fprintf(f, `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>%s</w:t></w:r></w:p></w:body></w:document>`, texto)
	z.Close()
	return buf.Bytes()
}

func lista(v any) []any {
	l, _ := v.([]any)
	return l
}

func TestFluxoCompleto(t *testing.T) {
	c, _ := novoAmbiente(t, iaFalsa{atraso: 50 * time.Millisecond})

	exigir(t, c.chamar("GET", "/healthz", "", nil), 200, "saúde")
	exigir(t, c.chamar("GET", "/api/textos", "", nil), 401, "sem login")
	exigir(t, c.chamar("GET", "/api/rota-que-nao-existe", "", nil), 404, "rota inexistente")

	// Login e limite de tentativas.
	for i := 0; i < 5; i++ {
		exigir(t, c.chamar("POST", "/api/auth/login", "", map[string]string{"email": "admin@escola.test", "senha": "errada"}), 401, "senha errada")
	}
	r := c.chamar("POST", "/api/auth/login", "", map[string]string{"email": "admin@escola.test", "senha": "senha-do-admin"})
	if r.status != 429 {
		t.Fatalf("depois de 5 erros o login devia ficar bloqueado: %d", r.status)
	}
	c2, _ := novoAmbiente(t, iaFalsa{atraso: 50 * time.Millisecond})
	c = c2
	admin := c.login("ADMIN@escola.test", "senha-do-admin")
	if r := c.chamar("GET", "/api/me", admin, nil); r.corpo["perfil"] != "admin" {
		t.Fatalf("me: %s", r.bruto)
	}

	// Usuários.
	exigir(t, c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Prof", "email": "prof@escola.test", "senha": "curta", "perfil": "professor"}), 422, "senha fraca")
	exigir(t, c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Prof", "email": "prof@escola.test", "senha": "senha-da-professora", "perfil": "professor"}), 201, "criar professora")
	exigir(t, c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Outra", "email": "PROF@escola.test", "senha": "senha-da-professora", "perfil": "professor"}), 409, "e-mail repetido")
	exigir(t, c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Coord", "email": "coord@escola.test", "senha": "senha-da-coordenacao", "perfil": "leitura"}), 422, "perfil leitura não existe")
	prof := c.login("prof@escola.test", "senha-da-professora")
	exigir(t, c.chamar("GET", "/api/usuarios", prof, nil), 403, "professora listando usuários")

	// Criação com validações.
	base := map[string]any{"aluno_codigo": "8A-07", "turma": "8º A", "grupo": "Rural", "conteudo": "Eu ja fui pra escola. Nós vai de onibus.", "consentimento": true}
	semConsent := map[string]any{"aluno_codigo": "8A-07", "conteudo": "Texto."}
	exigir(t, c.chamar("POST", "/api/textos", prof, semConsent), 422, "sem consentimento")
	ruim := map[string]any{"aluno_codigo": "8A-07", "conteudo": "Texto.", "consentimento": true, "grupo": "Inventado"}
	exigir(t, c.chamar("POST", "/api/textos", prof, ruim), 422, "grupo inválido")
	exigir(t, c.chamar("POST", "/api/textos", prof, map[string]any{"campo_estranho": 1}), 400, "campo desconhecido")
	exigir(t, c.chamar("POST", "/api/textos", admin, base), 403, "admin criando texto")
	r = c.chamar("POST", "/api/textos", prof, base)
	exigir(t, r, 201, "criar texto")
	id := r.corpo["id"].(string)
	if r.corpo["status"] != "pendente" || r.corpo["palavras"].(float64) != 9 {
		t.Fatalf("texto criado: %s", r.bruto)
	}

	// Importação de arquivos.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.WriteField("turma", "8º A")
	mw.WriteField("grupo", "Urbano")
	mw.WriteField("consentimento", "sim")
	for nome, dados := range map[string][]byte{
		"8A-11.txt":  []byte("Minha familia mora perto da escola."),
		"8A-12.docx": docxCom("No sabado eu fui ao parque."),
		"foto.jpg":   {0xFF, 0xD8},
	} {
		fw, _ := mw.CreateFormFile("arquivos", nome)
		fw.Write(dados)
	}
	mw.Close()
	req, _ := http.NewRequest("POST", c.url+"/api/textos/importar", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+prof)
	r = c.enviar(req)
	exigir(t, r, 201, "importar")
	if len(lista(r.corpo["criados"])) != 2 || len(lista(r.corpo["erros"])) != 1 {
		t.Fatalf("importação: %s", r.bruto)
	}
	codigos := map[string]bool{}
	for _, x := range lista(r.corpo["criados"]) {
		codigos[x.(map[string]any)["aluno_codigo"].(string)] = true
	}
	if !codigos["8A-11"] || !codigos["8A-12"] {
		t.Fatalf("o nome do arquivo devia virar o código do estudante: %v", codigos)
	}

	// Correção simulada, aguardando o resultado.
	r = c.chamar("POST", "/api/textos/"+id+"/corrigir?aguardar=true", prof, map[string]string{"motor": "simulado"})
	exigir(t, r, 200, "corrigir simulado")
	aps := lista(r.corpo["apontamentos"])
	if r.corpo["status"] != "revisao" || len(aps) != 3 || r.corpo["motor"] != "simulado" {
		t.Fatalf("correção: %s", r.bruto)
	}
	exigir(t, c.chamar("POST", "/api/textos/"+id+"/enviar", prof, nil), 409, "enviar com pendências")
	exigir(t, c.chamar("GET", "/api/textos/"+id+"/devolutiva", prof, nil), 409, "devolutiva antes do envio")

	ap := func(i int) string { return aps[i].(map[string]any)["id"].(string) }
	rota := func(i int) string { return "/api/textos/" + id + "/apontamentos/" + ap(i) }
	exigir(t, c.chamar("PATCH", rota(0), admin, map[string]any{"decisao": "aceita"}), 403, "admin decidindo")
	exigir(t, c.chamar("PATCH", rota(0), prof, map[string]any{}), 400, "sem decisão")
	exigir(t, c.chamar("PATCH", rota(0), prof, map[string]any{"decisao": "editada"}), 422, "editada sem texto")
	r = c.chamar("PATCH", rota(0), prof, map[string]any{"decisao": "editada", "sugestao_final": "já"})
	exigir(t, r, 200, "editar igual à sugestão")
	if r.corpo["apontamento"].(map[string]any)["decisao"] != "aceita" {
		t.Fatalf("editar para o mesmo texto devia contar como aceita: %s", r.bruto)
	}
	exigir(t, c.chamar("PATCH", rota(1), prof, map[string]any{"decisao": "recusada"}), 200, "recusar")
	r = c.chamar("PATCH", rota(2), prof, map[string]any{"decisao": "editada", "sugestao_final": "ônibus escolar"})
	exigir(t, r, 200, "editar")
	if r.corpo["pendentes"].(float64) != 0 {
		t.Fatalf("pendentes: %s", r.bruto)
	}
	exigir(t, c.chamar("PUT", "/api/textos/"+id+"/comentario", prof, map[string]string{"comentario": "Muito bem!"}), 204, "comentário")
	r = c.chamar("POST", "/api/textos/"+id+"/enviar", prof, nil)
	exigir(t, r, 200, "enviar")
	if r.corpo["status"] != "concluido" || r.corpo["comentario_professor"] != "Muito bem!" {
		t.Fatalf("envio: %s", r.bruto)
	}
	exigir(t, c.chamar("PATCH", rota(1), prof, map[string]any{"decisao": "aceita"}), 409, "decidir depois do envio")
	exigir(t, c.chamar("POST", "/api/textos/"+id+"/corrigir", prof, nil), 409, "corrigir depois do envio")

	r = c.chamar("GET", "/api/textos/"+id+"/devolutiva", admin, nil)
	exigir(t, r, 200, "devolutiva")
	if r.corpo["texto_corrigido"] != "Eu já fui pra escola. Nós vai de ônibus escolar." {
		t.Fatalf("texto corrigido: %v", r.corpo["texto_corrigido"])
	}
	if len(lista(r.corpo["para_reescrita"])) != 2 {
		t.Fatalf("o recusado não deve ir ao estudante: %s", r.bruto)
	}

	// Reescrita (v2) corrigida pela "IA", em segundo plano.
	exigir(t, c.chamar("POST", "/api/textos", prof, map[string]any{"origem_id": id, "aluno_codigo": "outro", "conteudo": "x", "consentimento": true}), 422, "aluno divergente")
	r = c.chamar("POST", "/api/textos", prof, map[string]any{"origem_id": id, "conteudo": "Eu ja fui para a escola. Nós vamos de ônibus.", "consentimento": true})
	exigir(t, r, 201, "criar reescrita")
	v2 := r.corpo["id"].(string)
	if r.corpo["versao"].(float64) != 2 || r.corpo["aluno_codigo"] != "8A-07" || r.corpo["grupo"] != "Rural" {
		t.Fatalf("reescrita: %s", r.bruto)
	}
	r = c.chamar("POST", "/api/textos/"+v2+"/corrigir", prof, nil)
	exigir(t, r, 202, "corrigir em segundo plano")
	if r.corpo["status"] != "corrigindo" {
		t.Fatalf("status: %s", r.bruto)
	}
	exigir(t, c.chamar("POST", "/api/textos/"+v2+"/corrigir", prof, nil), 409, "corrigir duas vezes")
	prazo := time.Now().Add(5 * time.Second)
	for {
		r = c.chamar("GET", "/api/textos/"+v2, prof, nil)
		if r.corpo["status"] == "revisao" {
			break
		}
		if time.Now().After(prazo) {
			t.Fatalf("a correção não terminou: %s", r.bruto)
		}
		time.Sleep(20 * time.Millisecond)
	}
	if r.corpo["motor"] != "ia" || len(lista(r.corpo["apontamentos"])) != 1 {
		t.Fatalf("correção da IA: %s", r.bruto)
	}
	exigir(t, c.chamar("POST", "/api/textos/"+v2+"/decisoes", prof, map[string]string{"decisao": "editada"}), 400, "decidir todos com editada")
	exigir(t, c.chamar("POST", "/api/textos/"+v2+"/decisoes", prof, map[string]string{"decisao": "aceita"}), 200, "aceitar toda a correção")
	exigir(t, c.chamar("POST", "/api/textos/"+v2+"/enviar", prof, map[string]string{"comentario": "Evoluiu!"}), 200, "enviar v2")

	r = c.chamar("GET", "/api/metricas", admin, nil)
	exigir(t, r, 200, "métricas")
	if r.corpo["discordancia_geral"].(float64) != 50 || len(lista(r.corpo["versoes"])) != 1 {
		t.Fatalf("métricas: %s", r.bruto)
	}
	r = c.chamar("GET", "/api/metricas/decisoes.csv", admin, nil)
	exigir(t, r, 200, "csv")
	if linhas := strings.Split(strings.TrimSpace(string(r.bruto)), "\n"); len(linhas) != 5 || !strings.HasPrefix(linhas[0], "texto_id,versao") || strings.Contains(string(r.bruto), "8A-07") {
		t.Fatalf("csv inesperado:\n%s", r.bruto)
	}

	// Listagem com filtro.
	r = c.chamar("GET", "/api/textos?status=concluido", prof, nil)
	if len(lista(r.corpo["textos"])) != 2 {
		t.Fatalf("filtro por status: %s", r.bruto)
	}
	exigir(t, c.chamar("GET", "/api/textos?status=xyz", prof, nil), 400, "status inválido")

	// Configuração.
	exigir(t, c.chamar("PUT", "/api/config", prof, map[string]any{"criterios": []string{"Ortografia"}, "grupos": []string{}, "limiar_vies": 15}), 403, "professora alterando config")
	exigir(t, c.chamar("PUT", "/api/config", admin, map[string]any{"criterios": []string{"Ortografia"}, "grupos": []string{}, "limiar_vies": 2}), 422, "limiar inválido")
	exigir(t, c.chamar("PUT", "/api/config", admin, map[string]any{"criterios": []string{"Gramática"}, "grupos": []string{}, "limiar_vies": 15}), 422, "critério inválido")
	r = c.chamar("PUT", "/api/config", admin, map[string]any{"criterios": []string{"Pontuação", "Ortografia"}, "grupos": []string{"Quilombola", "Rural", "rural", ""}, "limiar_vies": 20})
	exigir(t, r, 200, "salvar config")
	cfg := r.corpo["configuracao"].(map[string]any)
	if fmt.Sprint(cfg["criterios"]) != "[Ortografia Pontuação]" || fmt.Sprint(cfg["grupos"]) != "[Não informado Quilombola Rural]" {
		t.Fatalf("config: %s", r.bruto)
	}

	// Exemplos de demonstração.
	r = c.chamar("POST", "/api/textos/exemplos", prof, nil)
	if r.corpo["criados"].(float64) != 8 {
		t.Fatalf("exemplos: %s", r.bruto)
	}
	if r = c.chamar("POST", "/api/textos/exemplos", prof, nil); r.corpo["criados"].(float64) != 0 {
		t.Fatalf("exemplos repetidos: %s", r.bruto)
	}
	r = c.chamar("GET", "/api/textos/d-01/devolutiva", prof, nil)
	exigir(t, r, 200, "devolutiva do exemplo")
	if !strings.HasPrefix(r.corpo["texto_corrigido"].(string), "Na semana passada, faltou luz") {
		t.Fatalf("exemplo: %v", r.corpo["texto_corrigido"])
	}
	if r = c.chamar("DELETE", "/api/textos/exemplos", prof, nil); r.corpo["removidos"].(float64) != 8 {
		t.Fatalf("remover exemplos: %s", r.bruto)
	}

	// Exclusão, auditoria e logout.
	exigir(t, c.chamar("DELETE", "/api/textos/"+v2, prof, nil), 204, "excluir")
	exigir(t, c.chamar("GET", "/api/textos/"+v2, prof, nil), 404, "texto excluído")
	exigir(t, c.chamar("GET", "/api/auditoria", prof, nil), 403, "auditoria para professora")
	r = c.chamar("GET", "/api/auditoria?limite=500", admin, nil)
	acoes := map[string]bool{}
	for _, x := range lista(r.corpo["registros"]) {
		acoes[x.(map[string]any)["acao"].(string)] = true
	}
	for _, a := range []string{"login", "criar_usuario", "criar_texto", "corrigir", "enviar_devolutiva", "alterar_config", "excluir_texto"} {
		if !acoes[a] {
			t.Errorf("auditoria sem a ação %s", a)
		}
	}
	exigir(t, c.chamar("POST", "/api/auth/logout", prof, nil), 204, "logout")
	exigir(t, c.chamar("GET", "/api/me", prof, nil), 401, "token após logout")
}

func TestUsuarioDesativadoPerdeAcesso(t *testing.T) {
	c, _ := novoAmbiente(t, nil)
	admin := c.login("admin@escola.test", "senha-do-admin")
	r := c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Prof", "email": "p@escola.test", "senha": "senha-da-professora", "perfil": "professor"})
	exigir(t, r, 201, "criar")
	pid := r.corpo["id"].(string)
	prof := c.login("p@escola.test", "senha-da-professora")
	adminID := c.chamar("GET", "/api/me", admin, nil).corpo["id"].(string)
	exigir(t, c.chamar("PATCH", "/api/usuarios/"+adminID, admin, map[string]any{"perfil": "professor"}), 409, "admin rebaixando a si")
	exigir(t, c.chamar("PATCH", "/api/usuarios/"+pid, admin, map[string]any{"ativo": false}), 200, "desativar")
	exigir(t, c.chamar("GET", "/api/me", prof, nil), 401, "sessão encerrada")
	exigir(t, c.chamar("POST", "/api/auth/login", "", map[string]string{"email": "p@escola.test", "senha": "senha-da-professora"}), 401, "login desativado")
}

func TestServeInterfaceEstatica(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("<title>Corretor</title>"), 0o644)
	st, err := store.Abrir(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Fechar()
	srv := Novo(st, config.Config{CorrecaoConcorrencia: 1, DirEstatico: dir}, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
	hs := httptest.NewServer(srv.Handler())
	defer hs.Close()
	c := cliente{t: t, url: hs.URL}
	if r := c.chamar("GET", "/", "", nil); r.status != 200 || !strings.Contains(string(r.bruto), "Corretor") {
		t.Fatalf("interface: %d %s", r.status, r.bruto)
	}
	exigir(t, c.chamar("GET", "/api/nada", "", nil), 404, "rota da API inexistente")
}

// novoProfessor cadastra uma professora e devolve o token dela. Só o professor corrige.
func novoProfessor(c cliente, admin string) string {
	c.t.Helper()
	exigir(c.t, c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Prof", "email": "prof@escola.test", "senha": "senha-da-professora", "perfil": "professor"}), 201, "criar professora")
	return c.login("prof@escola.test", "senha-da-professora")
}

func TestIANaoConfigurada(t *testing.T) {
	c, _ := novoAmbiente(t, nil)
	admin := c.login("admin@escola.test", "senha-do-admin")
	prof := novoProfessor(c, admin)
	r := c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "X1", "conteudo": "Eu ja fui.", "consentimento": true})
	id := r.corpo["id"].(string)
	exigir(t, c.chamar("POST", "/api/textos/"+id+"/corrigir", prof, map[string]string{"motor": "ia"}), 422, "IA ausente")
	r = c.chamar("POST", "/api/textos/"+id+"/corrigir?aguardar=1", prof, nil)
	exigir(t, r, 200, "sem IA, usa o simulado")
	if r.corpo["motor"] != "simulado" {
		t.Fatalf("motor: %s", r.bruto)
	}
	if c.chamar("GET", "/api/config", admin, nil).corpo["ia_configurada"] != false {
		t.Fatal("ia_configurada devia ser false")
	}
}

// iaComErro devolve sempre o mesmo erro.
type iaComErro struct{ err error }

func (iaComErro) Nome() string { return "ia" }
func (f iaComErro) Corrigir(context.Context, string, []string) (corretor.Resposta, error) {
	return corretor.Resposta{}, f.err
}

func TestFalhaNaCorrecaoVoltaParaPendente(t *testing.T) {
	c, _ := novoAmbiente(t, iaComErro{corretor.ErrLimite})
	admin := c.login("admin@escola.test", "senha-do-admin")
	prof := novoProfessor(c, admin)
	r := c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "X1", "conteudo": "Eu ja fui.", "consentimento": true})
	id := r.corpo["id"].(string)
	r = c.chamar("POST", "/api/textos/"+id+"/corrigir?aguardar=true", prof, nil)
	exigir(t, r, 200, "corrigir")
	if r.corpo["status"] != "pendente" || !strings.Contains(r.corpo["erro_correcao"].(string), "Aguarde um minuto") {
		t.Fatalf("falha: %s", r.bruto)
	}
}

// iaDupla aponta "ja" e "nos" (dois apontamentos), sem demora.
type iaDupla struct{}

func (iaDupla) Nome() string { return "ia" }
func (iaDupla) Corrigir(context.Context, string, []string) (corretor.Resposta, error) {
	return corretor.Resposta{Apontamentos: []corretor.Bruto{
		{Trecho: "ja", Sugestao: "já", Criterio: "Ortografia", Explicacao: "Leva acento."},
		{Trecho: "nos", Sugestao: "nós", Criterio: "Ortografia", Explicacao: "Leva acento."},
	}}, nil
}

func TestListarCompletoEDecidirSoPendentes(t *testing.T) {
	c, _ := novoAmbiente(t, iaDupla{})
	admin := c.login("admin@escola.test", "senha-do-admin")
	prof := novoProfessor(c, admin)
	r := c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "X1", "conteudo": "Eu ja fui e nos vamos.", "consentimento": true})
	id := r.corpo["id"].(string)
	r = c.chamar("POST", "/api/textos/"+id+"/corrigir?aguardar=true", prof, nil)
	exigir(t, r, 200, "corrigir")
	aps := lista(r.corpo["apontamentos"])
	if len(aps) != 2 {
		t.Fatalf("esperava 2 apontamentos: %s", r.bruto)
	}

	// A listagem padrão vem sem apontamentos; com completo=true, vem com eles.
	if _, tem := lista(c.chamar("GET", "/api/textos", admin, nil).corpo["textos"])[0].(map[string]any)["apontamentos"]; tem {
		t.Fatal("a listagem padrão não deveria trazer apontamentos")
	}
	completo := lista(c.chamar("GET", "/api/textos?completo=true", admin, nil).corpo["textos"])[0].(map[string]any)
	if len(lista(completo["apontamentos"])) != 2 {
		t.Fatalf("completo=true sem apontamentos: %v", completo)
	}

	// O professor ajusta o primeiro; "aceitar pendentes" não pode apagar esse ajuste.
	primeiro := aps[0].(map[string]any)["id"].(string)
	exigir(t, c.chamar("PATCH", "/api/textos/"+id+"/apontamentos/"+primeiro, prof,
		map[string]any{"decisao": "editada", "sugestao_final": "já agora"}), 200, "editar")
	r = c.chamar("POST", "/api/textos/"+id+"/decisoes", prof, map[string]any{"decisao": "aceita", "apenas_pendentes": true})
	exigir(t, r, 200, "aceitar pendentes")
	for _, a := range lista(r.corpo["apontamentos"]) {
		ap := a.(map[string]any)
		quero := "aceita"
		if ap["id"] == primeiro {
			quero = "editada"
		}
		if ap["decisao"] != quero {
			t.Fatalf("apontamento %v: decisão %v, quero %s", ap["id"], ap["decisao"], quero)
		}
	}
	if ap := lista(r.corpo["apontamentos"])[0].(map[string]any); ap["id"] == primeiro && ap["sugestao_final"] != "já agora" {
		t.Fatalf("o ajuste do professor foi perdido: %s", r.bruto)
	}

	// Sem a opção, o comportamento antigo continua: decide tudo.
	r = c.chamar("POST", "/api/textos/"+id+"/decisoes", prof, map[string]any{"decisao": "recusada"})
	exigir(t, r, 200, "recusar tudo")
	for _, a := range lista(r.corpo["apontamentos"]) {
		if a.(map[string]any)["decisao"] != "recusada" {
			t.Fatalf("recusar tudo: %s", r.bruto)
		}
	}
}

func TestPropostas(t *testing.T) {
	c, _ := novoAmbiente(t, nil)
	admin := c.login("admin@escola.test", "senha-do-admin")
	prof := novoProfessor(c, admin)

	base := map[string]any{"tema": "A vida no campo", "genero": "Narrativo", "turmas": []string{"8º A"}, "prazo": "2026-12-10"}
	exigir(t, c.chamar("POST", "/api/propostas", admin, base), 403, "admin criando proposta")
	exigir(t, c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Ok", "genero": "Narrativo", "turmas": []string{"8º A"}}), 422, "tema curto")
	exigir(t, c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Tema bom", "genero": "Poema", "turmas": []string{"8º A"}}), 422, "gênero inválido")
	exigir(t, c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Tema bom", "genero": "Narrativo", "turmas": []string{" "}}), 422, "sem turma")
	exigir(t, c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Tema bom", "genero": "Narrativo", "turmas": []string{"8º A"}, "prazo": "10/12/2026"}), 422, "prazo inválido")

	r := c.chamar("POST", "/api/propostas", prof, base)
	exigir(t, r, 201, "criar proposta")
	id := r.corpo["id"].(string)
	if r.corpo["prazo"] != "2026-12-10" || r.corpo["encerrada"] != false {
		t.Fatalf("proposta criada: %s", r.bruto)
	}

	// Importar dentro da proposta: turma e título vêm dela.
	r = c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "Ipê Lilás", "conteudo": "Eu ja fui na roça.", "consentimento": true, "proposta_id": id})
	exigir(t, r, 201, "texto na proposta")
	if r.corpo["turma"] != "8º A" || r.corpo["titulo"] != "A vida no campo" || r.corpo["proposta_id"] != id {
		t.Fatalf("herança da proposta: %s", r.bruto)
	}
	textoID := r.corpo["id"].(string)
	exigir(t, c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "Onça Jade", "turma": "9º B", "conteudo": "Texto.", "consentimento": true, "proposta_id": id}), 422, "turma fora da proposta")
	exigir(t, c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "Onça Jade", "conteudo": "Texto.", "consentimento": true, "proposta_id": "nao-existe"}), 422, "proposta inexistente")
	exigir(t, c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "Avulso", "conteudo": "Texto avulso.", "consentimento": true}), 201, "texto avulso")

	// Filtro e contagem.
	if n := len(lista(c.chamar("GET", "/api/textos?proposta="+id, admin, nil).corpo["textos"])); n != 1 {
		t.Fatalf("filtro por proposta: %d textos", n)
	}
	r = c.chamar("GET", "/api/propostas/"+id, admin, nil)
	exigir(t, r, 200, "obter proposta")
	if cont := r.corpo["contagem"].(map[string]any); cont["total"] != float64(1) || cont["aguardando_ia"] != float64(1) {
		t.Fatalf("contagem: %s", r.bruto)
	}

	// CSV ganha a coluna proposta_id e aceita o filtro.
	exigir(t, c.chamar("POST", "/api/textos/"+textoID+"/corrigir?aguardar=true", prof, nil), 200, "corrigir")
	exigir(t, c.chamar("POST", "/api/textos/"+textoID+"/decisoes", prof, map[string]any{"decisao": "aceita"}), 200, "decidir")
	r = c.chamar("GET", "/api/metricas/decisoes.csv?proposta="+id, admin, nil)
	exigir(t, r, 200, "csv")
	linhas := strings.Split(strings.TrimSpace(string(r.bruto)), "\n")
	if !strings.HasSuffix(linhas[0], ",proposta_id") || len(linhas) < 2 || !strings.HasSuffix(linhas[1], ","+id) {
		t.Fatalf("csv: %s", r.bruto)
	}

	// Encerrar: não aceita novas redações; reabrir volta a aceitar.
	r = c.chamar("PATCH", "/api/propostas/"+id, prof, map[string]any{"encerrada": true, "prazo": nil})
	exigir(t, r, 200, "encerrar")
	if r.corpo["encerrada"] != true || r.corpo["prazo"] != nil {
		t.Fatalf("encerrar: %s", r.bruto)
	}
	r = c.chamar("POST", "/api/textos", prof, map[string]any{"aluno_codigo": "Onça Jade", "conteudo": "Texto.", "consentimento": true, "proposta_id": id})
	if r.status != 422 || r.erro() != "proposta_encerrada" {
		t.Fatalf("importar em proposta encerrada: %d %s", r.status, r.bruto)
	}
	if n := len(lista(c.chamar("GET", "/api/propostas?situacao=abertas", admin, nil).corpo["propostas"])); n != 0 {
		t.Fatalf("abertas: %d", n)
	}

	// Excluir: só sem redações.
	exigir(t, c.chamar("DELETE", "/api/propostas/"+id, prof, nil), 409, "excluir com redações")
	r = c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Rascunho de tema", "genero": "Outro", "turmas": []string{"8º A"}})
	exigir(t, c.chamar("DELETE", "/api/propostas/"+r.corpo["id"].(string), prof, nil), 204, "excluir vazia")
	r = c.chamar("GET", "/api/propostas/nao-existe", admin, nil)
	if r.status != 404 || !strings.Contains(string(r.bruto), "Proposta não encontrada") {
		t.Fatalf("404: %d %s", r.status, r.bruto)
	}
}

func TestEnvioPeloAluno(t *testing.T) {
	c, _ := novoAmbiente(t, nil)
	admin := c.login("admin@escola.test", "senha-do-admin")
	prof := novoProfessor(c, admin)
	cfg := c.chamar("GET", "/api/config", admin, nil).corpo["configuracao"].(map[string]any)
	grupo := lista(cfg["grupos"])[1].(string)

	p := c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "A vida no campo", "genero": "Narrativo", "turmas": []string{"8º A"}})
	propostaID := p.corpo["id"].(string)
	outra := c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Outra turma", "genero": "Relato", "turmas": []string{"9º B"}}).corpo["id"].(string)
	segunda := c.chamar("POST", "/api/propostas", prof, map[string]any{"tema": "Minha escola", "genero": "Relato", "turmas": []string{"8º A"}}).corpo["id"].(string)

	alunos := []map[string]any{{"aluno_codigo": "Ipê Lilás", "turma": "8º A", "grupo": grupo}, {"aluno_codigo": "Onça Jade", "turma": "8º A"}}
	exigir(t, c.chamar("POST", "/api/codigos", prof, map[string]any{"alunos": alunos}), 422, "sem consentimento")
	r := c.chamar("POST", "/api/codigos", prof, map[string]any{"alunos": alunos, "consentimento": true})
	exigir(t, r, 201, "gerar códigos")
	codigos := lista(r.corpo["codigos"])
	codigo := codigos[0].(map[string]any)["codigo"].(string)
	codigoOnca := codigos[1].(map[string]any)["codigo"].(string)
	if len(codigo) != 9 || codigo[4] != '-' {
		t.Fatalf("formato do código: %q", codigo)
	}
	if n := len(lista(c.chamar("GET", "/api/codigos?turma="+url.QueryEscape("8º A"), prof, nil).corpo["codigos"])); n != 2 {
		t.Fatalf("códigos ativos: %d", n)
	}

	// Acesso: código errado não entra; o certo funciona sem hífen e em minúsculas.
	exigir(t, c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": "AAAA-BBBB"}), 401, "código errado")
	r = c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": strings.ToLower(strings.ReplaceAll(codigo, "-", ""))})
	exigir(t, r, 200, "acesso")
	if r.corpo["aluno"] != "Ipê Lilás" || len(lista(r.corpo["propostas"])) != 2 {
		t.Fatalf("painel do aluno: %s", r.bruto)
	}

	// Entrega por texto colado: entra na fila do professor como enviada pelo aluno.
	exigir(t, c.chamar("POST", "/api/aluno/entregas", "", map[string]string{"codigo": codigo, "proposta_id": outra, "conteudo": "Texto."}), 422, "proposta de outra turma")
	r = c.chamar("POST", "/api/aluno/entregas", "", map[string]string{"codigo": codigo, "proposta_id": propostaID, "conteudo": "Eu ja fui na roça."})
	exigir(t, r, 201, "entrega")
	textoID := r.corpo["texto_id"].(string)
	texto := c.chamar("GET", "/api/textos/"+textoID, prof, nil).corpo
	if texto["origem"] != "aluno" || texto["grupo"] != grupo || texto["proposta_id"] != propostaID || texto["titulo"] != "A vida no campo" {
		t.Fatalf("texto do aluno: %v", texto)
	}

	// Reenvio troca o texto enquanto a correção não começou.
	r = c.chamar("POST", "/api/aluno/entregas", "", map[string]string{"codigo": codigo, "proposta_id": propostaID, "conteudo": "Eu já fui na roça, e voltei."})
	exigir(t, r, 200, "reenvio")
	if c.chamar("GET", "/api/textos/"+textoID, prof, nil).corpo["conteudo"] != "Eu já fui na roça, e voltei." {
		t.Fatal("o reenvio não trocou o texto")
	}

	// Entrega por arquivo, em outra proposta.
	var corpo bytes.Buffer
	mw := multipart.NewWriter(&corpo)
	_ = mw.WriteField("codigo", codigo)
	_ = mw.WriteField("proposta_id", segunda)
	fw, _ := mw.CreateFormFile("arquivo", "redacao.txt")
	_, _ = fw.Write([]byte("Na minha escola tem uma horta."))
	mw.Close()
	req, _ := http.NewRequest("POST", c.url+"/api/aluno/entregas", &corpo)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	exigir(t, c.enviar(req), 201, "entrega por arquivo")

	// Devolutiva: só depois do envio pelo professor, e só do próprio aluno.
	exigir(t, c.chamar("POST", "/api/aluno/devolutiva", "", map[string]string{"codigo": codigo, "texto_id": textoID}), 409, "antes do envio")
	exigir(t, c.chamar("POST", "/api/aluno/devolutiva", "", map[string]string{"codigo": codigoOnca, "texto_id": textoID}), 404, "devolutiva de outro aluno")
	exigir(t, c.chamar("POST", "/api/textos/"+textoID+"/corrigir?aguardar=true", prof, nil), 200, "corrigir")
	exigir(t, c.chamar("POST", "/api/aluno/entregas", "", map[string]string{"codigo": codigo, "proposta_id": propostaID, "conteudo": "Outro."}), 409, "reenvio depois da correção")
	exigir(t, c.chamar("POST", "/api/textos/"+textoID+"/decisoes", prof, map[string]any{"decisao": "aceita"}), 200, "decidir")
	exigir(t, c.chamar("POST", "/api/textos/"+textoID+"/enviar", prof, map[string]string{"comentario": "Muito bem!"}), 200, "enviar")
	r = c.chamar("POST", "/api/aluno/devolutiva", "", map[string]string{"codigo": codigo, "texto_id": textoID})
	exigir(t, r, 200, "devolutiva")
	if r.corpo["comentario"] != "Muito bem!" {
		t.Fatalf("devolutiva: %s", r.bruto)
	}
	if n := len(lista(c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": codigo}).corpo["devolutivas"])); n != 1 {
		t.Fatalf("devolutivas no painel: %d", n)
	}

	// Regenerar revoga o código anterior; revogar tira o acesso.
	novo := lista(c.chamar("POST", "/api/codigos", prof, map[string]any{"alunos": alunos[:1], "consentimento": true}).corpo["codigos"])[0].(map[string]any)["codigo"].(string)
	exigir(t, c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": codigo}), 401, "código antigo")
	exigir(t, c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": novo}), 200, "código novo")
	exigir(t, c.chamar("DELETE", "/api/codigos/"+url.PathEscape("Ipê Lilás"), prof, nil), 204, "revogar")
	exigir(t, c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": novo}), 401, "revogado")

	// Limite de tentativas erradas por IP.
	var ultimo resposta
	for i := 0; i < 12; i++ {
		ultimo = c.chamar("POST", "/api/aluno/acesso", "", map[string]string{"codigo": "ZZZZ-ZZZZ"})
	}
	exigir(t, ultimo, 429, "muitas tentativas")
}
