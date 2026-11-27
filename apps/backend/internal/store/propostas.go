package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"corretor-textual/internal/dominio"
)

const colsProposta = `p.id, p.tema, p.genero, p.enunciado, p.turmas, p.prazo, p.encerrada, p.criado_por, p.criado_em, p.atualizado_em,
	(SELECT COUNT(*) FROM textos t WHERE t.proposta_id = p.id),
	(SELECT COUNT(*) FROM textos t WHERE t.proposta_id = p.id AND t.status IN ('pendente', 'corrigindo')),
	(SELECT COUNT(*) FROM textos t WHERE t.proposta_id = p.id AND t.status = 'revisao'),
	(SELECT COUNT(*) FROM textos t WHERE t.proposta_id = p.id AND t.status = 'concluido')`

func scanProposta(r interface{ Scan(...any) error }) (dominio.Proposta, error) {
	var p dominio.Proposta
	var turmas string
	var prazo, criadoPor sql.NullString
	var encerrada int
	var criado, atualizado int64
	c := &p.Contagem
	err := r.Scan(&p.ID, &p.Tema, &p.Genero, &p.Enunciado, &turmas, &prazo, &encerrada, &criadoPor, &criado, &atualizado,
		&c.Total, &c.AguardandoIA, &c.Revisao, &c.Concluidos)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return p, ErrNaoEncontrado
		}
		return p, err
	}
	p.Turmas = []string{}
	_ = json.Unmarshal([]byte(turmas), &p.Turmas)
	p.Prazo = strNula(prazo)
	p.Encerrada = encerrada == 1
	p.CriadoPor = strNula(criadoPor)
	p.CriadoEm = deMs(criado)
	p.AtualizadoEm = deMs(atualizado)
	return p, nil
}

// CriarProposta grava uma proposta nova (aberta).
func (s *Store) CriarProposta(ctx context.Context, p dominio.Proposta) (dominio.Proposta, error) {
	if p.ID == "" {
		p.ID = NovoID()
	}
	agora := ms(s.now())
	turmas, _ := json.Marshal(p.Turmas)
	_, err := s.db.ExecContext(ctx, `INSERT INTO propostas (id, tema, genero, enunciado, turmas, prazo, encerrada, criado_por, criado_em, atualizado_em)
		VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
		p.ID, p.Tema, p.Genero, p.Enunciado, string(turmas), nulo(p.Prazo), nulo(p.CriadoPor), agora, agora)
	if err != nil {
		return p, err
	}
	return s.BuscarProposta(ctx, p.ID)
}

func (s *Store) BuscarProposta(ctx context.Context, id string) (dominio.Proposta, error) {
	return scanProposta(s.db.QueryRowContext(ctx, `SELECT `+colsProposta+` FROM propostas p WHERE p.id = ?`, id))
}

// ListarPropostas devolve as propostas, abertas primeiro e as mais recentes antes.
// encerradas: nil = todas, true/false = só encerradas/abertas.
func (s *Store) ListarPropostas(ctx context.Context, encerradas *bool) ([]dominio.Proposta, error) {
	consulta := `SELECT ` + colsProposta + ` FROM propostas p`
	var args []any
	if encerradas != nil {
		consulta += ` WHERE p.encerrada = ?`
		args = append(args, b2i(*encerradas))
	}
	rows, err := s.db.QueryContext(ctx, consulta+` ORDER BY p.encerrada, p.criado_em DESC, p.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dominio.Proposta{}
	for rows.Next() {
		p, err := scanProposta(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// AlteracaoProposta muda só os campos presentes. LimparPrazo remove o prazo.
type AlteracaoProposta struct {
	Tema        *string
	Genero      *string
	Enunciado   *string
	Turmas      []string
	Prazo       *string
	LimparPrazo bool
	Encerrada   *bool
}

func (s *Store) AtualizarProposta(ctx context.Context, id string, a AlteracaoProposta) (dominio.Proposta, error) {
	atual, err := s.BuscarProposta(ctx, id)
	if err != nil {
		return atual, err
	}
	if a.Tema != nil {
		atual.Tema = *a.Tema
	}
	if a.Genero != nil {
		atual.Genero = *a.Genero
	}
	if a.Enunciado != nil {
		atual.Enunciado = *a.Enunciado
	}
	if a.Turmas != nil {
		atual.Turmas = a.Turmas
	}
	if a.LimparPrazo {
		atual.Prazo = nil
	} else if a.Prazo != nil {
		atual.Prazo = a.Prazo
	}
	if a.Encerrada != nil {
		atual.Encerrada = *a.Encerrada
	}
	turmas, _ := json.Marshal(atual.Turmas)
	if _, err := s.db.ExecContext(ctx, `UPDATE propostas SET tema = ?, genero = ?, enunciado = ?, turmas = ?, prazo = ?, encerrada = ?, atualizado_em = ? WHERE id = ?`,
		atual.Tema, atual.Genero, atual.Enunciado, string(turmas), nulo(atual.Prazo), b2i(atual.Encerrada), ms(s.now()), id); err != nil {
		return atual, err
	}
	return s.BuscarProposta(ctx, id)
}

// ExcluirProposta só apaga propostas sem redações; com redações, o caminho é encerrar.
func (s *Store) ExcluirProposta(ctx context.Context, id string) error {
	p, err := s.BuscarProposta(ctx, id)
	if err != nil {
		return err
	}
	if p.Contagem.Total > 0 {
		return ErrConflito{Motivo: "A proposta tem redações e não pode ser excluída. Encerre-a para que não receba novas."}
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM propostas WHERE id = ?`, id)
	return err
}
