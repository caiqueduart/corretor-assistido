package api

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
)

func TestDocs(t *testing.T) {
	c, _ := novoAmbiente(t, nil)

	// /docs redireciona para /docs/ (o cliente segue o redirecionamento).
	r := c.chamar("GET", "/docs", "", nil)
	exigir(t, r, 200, "página do Swagger UI")
	if !strings.Contains(string(r.bruto), "swagger-ui") {
		t.Fatalf("página sem Swagger UI: %s", r.bruto)
	}

	req, _ := http.NewRequest("GET", c.url+"/docs/openapi.json", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("spec: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
}

// TestSpecCobreRotas garante que docs/openapi.json documenta exatamente as
// rotas registradas em servidor.go.
func TestSpecCobreRotas(t *testing.T) {
	var spec struct {
		OpenAPI string                                `json:"openapi"`
		Paths   map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(specOpenAPI, &spec); err != nil {
		t.Fatalf("openapi.json inválido: %v", err)
	}
	if spec.OpenAPI == "" {
		t.Fatal("openapi.json sem o campo openapi")
	}

	var documentadas []string
	operacoes := map[string]string{}
	for caminho, itens := range spec.Paths {
		for metodo, op := range itens {
			if metodo == "parameters" {
				continue
			}
			rota := strings.ToUpper(metodo) + " " + caminho
			documentadas = append(documentadas, rota)
			var o struct {
				OperationID string `json:"operationId"`
			}
			_ = json.Unmarshal(op, &o)
			if o.OperationID == "" {
				t.Errorf("%s sem operationId", rota)
			} else if outra, ok := operacoes[o.OperationID]; ok {
				t.Errorf("operationId %q repetido em %s e %s", o.OperationID, outra, rota)
			}
			operacoes[o.OperationID] = rota
		}
	}

	fonte, err := os.ReadFile("servidor.go")
	if err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`m\.Handle(?:Func)?\("([A-Z]+) (/api/[^"]*|/healthz)"`)
	var registradas []string
	for _, m := range re.FindAllStringSubmatch(string(fonte), -1) {
		registradas = append(registradas, m[1]+" "+m[2])
	}
	if len(registradas) == 0 {
		t.Fatal("nenhuma rota encontrada em servidor.go")
	}

	for _, r := range registradas {
		if !slices.Contains(documentadas, r) {
			t.Errorf("rota sem documentação em openapi.json: %s", r)
		}
	}
	for _, d := range documentadas {
		if !slices.Contains(registradas, d) {
			t.Errorf("openapi.json documenta rota inexistente: %s", d)
		}
	}
}
