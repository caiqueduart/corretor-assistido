// Package exemplos carrega os textos de demonstração da POC
// (os mesmos 8 textos do roteiro de demonstração da interface).
package exemplos

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"time"

	"corretor-textual/internal/dominio"
	"corretor-textual/internal/store"
)

//go:embed exemplos.json
var dados []byte

type apontamento struct {
	Criterio      string  `json:"criterio"`
	Trecho        string  `json:"trecho"`
	Inicio        int     `json:"inicio"`
	Fim           int     `json:"fim"`
	Sugestao      string  `json:"sugestao"`
	Explicacao    string  `json:"explicacao"`
	Variacao      bool    `json:"variacao"`
	Decisao       *string `json:"decisao"`
	SugestaoFinal *string `json:"sugestao_final"`
}

type texto struct {
	ID                  string        `json:"id"`
	AlunoCodigo         string        `json:"aluno_codigo"`
	Turma               string        `json:"turma"`
	Grupo               string        `json:"grupo"`
	Titulo              string        `json:"titulo"`
	Versao              int           `json:"versao"`
	OrigemID            *string       `json:"origem_id"`
	Conteudo            string        `json:"conteudo"`
	Status              string        `json:"status"`
	Motor               string        `json:"motor"`
	CriteriosUsados     []string      `json:"criterios_usados"`
	ComentarioIA        string        `json:"comentario_ia"`
	ComentarioProfessor string        `json:"comentario_professor"`
	CriadoEm            time.Time     `json:"criado_em"`
	AvaliadoEm          *time.Time    `json:"avaliado_em"`
	EnviadoEm           *time.Time    `json:"enviado_em"`
	Apontamentos        []apontamento `json:"apontamentos"`
}

// Textos devolve os exemplos prontos para gravar.
func Textos() ([]dominio.Texto, error) {
	var brutos []texto
	if err := json.Unmarshal(dados, &brutos); err != nil {
		return nil, err
	}
	out := make([]dominio.Texto, 0, len(brutos))
	for _, b := range brutos {
		t := dominio.Texto{
			ID: b.ID, AlunoCodigo: b.AlunoCodigo, Turma: b.Turma, Grupo: b.Grupo, Titulo: b.Titulo,
			Versao: b.Versao, OrigemID: b.OrigemID, Conteudo: b.Conteudo, Status: dominio.Status(b.Status),
			Consentimento: true, Exemplo: true, Motor: b.Motor, CriteriosUsados: b.CriteriosUsados,
			ComentarioIA: b.ComentarioIA, ComentarioProfessor: b.ComentarioProfessor,
			CriadoEm: b.CriadoEm, AtualizadoEm: b.CriadoEm, AvaliadoEm: b.AvaliadoEm, EnviadoEm: b.EnviadoEm,
		}
		for _, a := range b.Apontamentos {
			ap := dominio.Apontamento{Criterio: a.Criterio, Trecho: a.Trecho, Inicio: a.Inicio, Fim: a.Fim,
				Sugestao: a.Sugestao, Explicacao: a.Explicacao, Variacao: a.Variacao, SugestaoFinal: a.SugestaoFinal}
			if a.Decisao != nil {
				d := dominio.Decisao(*a.Decisao)
				ap.Decisao = &d
				em := b.CriadoEm.Add(time.Hour)
				ap.DecididoEm = &em
			}
			t.Apontamentos = append(t.Apontamentos, ap)
		}
		out = append(out, t)
	}
	return out, nil
}

// Carregar grava os exemplos que ainda não existem. Devolve quantos foram criados.
// As versões 1 vêm antes das reescritas para respeitar a referência à origem.
func Carregar(ctx context.Context, s *store.Store, por *string) (int, error) {
	ts, err := Textos()
	if err != nil {
		return 0, err
	}
	n := 0
	for _, versao := range []int{1, 2} {
		for _, t := range ts {
			if t.Versao != versao {
				continue
			}
			if _, err := s.BuscarTexto(ctx, t.ID, false); err == nil {
				continue
			} else if !errors.Is(err, store.ErrNaoEncontrado) {
				return n, err
			}
			t.CriadoPor = por
			if _, err := s.CriarTexto(ctx, t); err != nil {
				return n, err
			}
			n++
		}
	}
	return n, nil
}
