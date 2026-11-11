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
	exigir(t, c.chamar("POST", "/api/usuarios", admin, map[string]string{"nome": "Coord", "email": "coord@escola.test", "senha": "senha-da-coordenacao", "perfil": "leitura"}), 201, "criar leitura")
	prof := c.login("prof@escola.test", "senha-da-professora")
	leitura := c.login("coord@escola.test", "senha-da-coordenacao")
	exigir(t, c.chamar("GET", "/api/usuarios", prof, nil), 403, "professora listando usuários")

	// Criação com validações.
	base := map[string]any{"aluno_codigo": "8A-07", "turma": "8º A", "grupo": "Rural", "conteudo": "Eu ja fui pra escola. Nós vai de onibus.", "consentimento": true}
	semConsent := map[string]any{"aluno_codigo": "8A-07", "conteudo": "Texto."}
	exigir(t, c.chamar("POST", "/api/textos", prof, semConsent), 422, "sem consentimento")
	ruim := map[string]any{"aluno_codigo": "8A-07", "conteudo": "Texto.", "consentimento": true, "grupo": "Inventado"}
	exigir(t, c.chamar("POST", "/api/textos", prof, ruim), 422, "grupo inválido")
	exigir(t, c.chamar("POST", "/api/textos", prof, map[string]any{"campo_estranho": 1}), 400, "campo desconhecido")
	exigir(t, c.chamar("POST", "/api/textos", leitura, base), 403, "leitura criando texto")
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
	exigir(t, c.chamar("PATCH", rota(0), leitura, map[string]any{"decisao": "aceita"}), 403, "leitura decidindo")
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

	r = c.chamar("GET", "/api/textos/"+id+"/devolutiva", leitura, nil)
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

	r = c.chamar("GET", "/api/metricas", leitura, nil)
	exigir(t, r, 200, "métricas")
	if r.corpo["discordancia_geral"].(float64) != 50 || len(lista(r.corpo["versoes"])) != 1 {
		t.Fatalf("métricas: %s", r.bruto)
	}
	r = c.chamar("GET", "/api/metricas/decisoes.csv", leitura, nil)
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
	exigir(t, c.chamar("PATCH", "/api/usuarios/"+adminID, admin, map[string]any{"perfil": "leitura"}), 409, "admin rebaixando a si")
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

func TestIANaoConfigurada(t *testing.T) {
	c, _ := novoAmbiente(t, nil)
	admin := c.login("admin@escola.test", "senha-do-admin")
	r := c.chamar("POST", "/api/textos", admin, map[string]any{"aluno_codigo": "X1", "conteudo": "Eu ja fui.", "consentimento": true})
	id := r.corpo["id"].(string)
	exigir(t, c.chamar("POST", "/api/textos/"+id+"/corrigir", admin, map[string]string{"motor": "ia"}), 422, "IA ausente")
	r = c.chamar("POST", "/api/textos/"+id+"/corrigir?aguardar=1", admin, nil)
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
	r := c.chamar("POST", "/api/textos", admin, map[string]any{"aluno_codigo": "X1", "conteudo": "Eu ja fui.", "consentimento": true})
	id := r.corpo["id"].(string)
	r = c.chamar("POST", "/api/textos/"+id+"/corrigir?aguardar=true", admin, nil)
	exigir(t, r, 200, "corrigir")
	if r.corpo["status"] != "pendente" || !strings.Contains(r.corpo["erro_correcao"].(string), "Aguarde um minuto") {
		t.Fatalf("falha: %s", r.bruto)
	}
}
