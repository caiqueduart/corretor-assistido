package api

import (
	_ "embed"
	"net/http"
)

// Documentação OpenAPI da API e página do Swagger UI, servidas em /docs/.
// Ao mudar uma rota, atualize docs/openapi.json (TestSpecCobreRotas confere).

//go:embed docs/openapi.json
var specOpenAPI []byte

//go:embed docs/index.html
var paginaDocs []byte

func (s *Servidor) docsRedirecionar(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "docs/", http.StatusMovedPermanently)
}

func (s *Servidor) docsPagina(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(paginaDocs)
}

func (s *Servidor) docsSpec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(specOpenAPI)
}
