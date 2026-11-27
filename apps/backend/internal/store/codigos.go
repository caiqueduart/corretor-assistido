package store

import (
	"context"
	"database/sql"
	"errors"

	"corretor-textual/internal/dominio"
)

const colsCodigo = `id, aluno_codigo, turma, grupo, criado_em, ultimo_uso`

func scanCodigo(r interface{ Scan(...any) error }) (dominio.CodigoAcesso, error) {
	var c dominio.CodigoAcesso
	var criado int64
	var uso sql.NullInt64
	if err := r.Scan(&c.ID, &c.AlunoCodigo, &c.Turma, &c.Grupo, &criado, &uso); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c, ErrNaoEncontrado
		}
		return c, err
	}
	c.CriadoEm = deMs(criado)
	c.UltimoUso = deMsNulo(uso)
	return c, nil
}

// GravarCodigo cria o código ativo do aluno, revogando o anterior (se houver).
func (s *Store) GravarCodigo(ctx context.Context, c dominio.CodigoAcesso, hash string, criadoPor *string) (dominio.CodigoAcesso, error) {
	if c.ID == "" {
		c.ID = NovoID()
	}
	agora := ms(s.now())
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return c, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE codigos_acesso SET revogado_em = ? WHERE aluno_codigo = ? AND revogado_em IS NULL`, agora, c.AlunoCodigo); err != nil {
		return c, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO codigos_acesso (id, aluno_codigo, turma, grupo, codigo_hash, criado_por, criado_em)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, c.ID, c.AlunoCodigo, c.Turma, c.Grupo, hash, nulo(criadoPor), agora); err != nil {
		return c, err
	}
	if err := tx.Commit(); err != nil {
		return c, err
	}
	c.CriadoEm = deMs(agora)
	return c, nil
}

// ListarCodigos devolve os códigos ativos (sem o código em si), filtrando pela turma se informada.
func (s *Store) ListarCodigos(ctx context.Context, turma string) ([]dominio.CodigoAcesso, error) {
	consulta := `SELECT ` + colsCodigo + ` FROM codigos_acesso WHERE revogado_em IS NULL`
	var args []any
	if turma != "" {
		consulta += ` AND turma = ?`
		args = append(args, turma)
	}
	rows, err := s.db.QueryContext(ctx, consulta+` ORDER BY turma, aluno_codigo`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dominio.CodigoAcesso{}
	for rows.Next() {
		c, err := scanCodigo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// RevogarCodigo desativa o código ativo do aluno.
func (s *Store) RevogarCodigo(ctx context.Context, aluno string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE codigos_acesso SET revogado_em = ? WHERE aluno_codigo = ? AND revogado_em IS NULL`, ms(s.now()), aluno)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNaoEncontrado
	}
	return nil
}

// UsarCodigo encontra o código ativo pelo hash e registra o uso.
func (s *Store) UsarCodigo(ctx context.Context, hash string) (dominio.CodigoAcesso, error) {
	c, err := scanCodigo(s.db.QueryRowContext(ctx, `SELECT `+colsCodigo+` FROM codigos_acesso WHERE codigo_hash = ? AND revogado_em IS NULL`, hash))
	if err != nil {
		return c, err
	}
	agora := s.now().UTC()
	_, err = s.db.ExecContext(ctx, `UPDATE codigos_acesso SET ultimo_uso = ? WHERE id = ?`, ms(agora), c.ID)
	c.UltimoUso = &agora
	return c, err
}

// SubstituirConteudo troca o texto de uma entrega ainda não corrigida (reenvio do aluno).
func (s *Store) SubstituirConteudo(ctx context.Context, textoID, conteudo string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE textos SET conteudo = ?, erro_correcao = '', atualizado_em = ? WHERE id = ? AND status = 'pendente'`,
		conteudo, ms(s.now()), textoID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrConflito{Motivo: "A correção desta redação já começou. Não dá mais para trocar o texto."}
	}
	return nil
}
