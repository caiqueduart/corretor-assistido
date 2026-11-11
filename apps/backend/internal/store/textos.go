package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"corretor-textual/internal/dominio"
)

const colsTexto = `t.id, t.aluno_codigo, t.turma, t.grupo, t.titulo, t.versao, t.origem_id, t.conteudo, t.status,
	t.consentimento, t.exemplo, t.motor, t.criterios_usados, t.comentario_ia, t.comentario_professor,
	t.descartados, t.erro_correcao, t.criado_por, t.criado_em, t.atualizado_em, t.avaliado_em, t.enviado_em, t.enviado_por,
	(SELECT COUNT(*) FROM apontamentos a WHERE a.texto_id = t.id),
	(SELECT COUNT(*) FROM apontamentos a WHERE a.texto_id = t.id AND a.decisao IS NULL)`

func scanTexto(r interface{ Scan(...any) error }) (dominio.Texto, error) {
	var t dominio.Texto
	var origem, criadoPor, enviadoPor sql.NullString
	var status, crit string
	var consent, exemplo int
	var criado, atualizado int64
	var avaliado, enviado sql.NullInt64
	err := r.Scan(&t.ID, &t.AlunoCodigo, &t.Turma, &t.Grupo, &t.Titulo, &t.Versao, &origem, &t.Conteudo, &status,
		&consent, &exemplo, &t.Motor, &crit, &t.ComentarioIA, &t.ComentarioProfessor,
		&t.Descartados, &t.ErroCorrecao, &criadoPor, &criado, &atualizado, &avaliado, &enviado, &enviadoPor,
		&t.TotalApontamento, &t.Pendentes)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return t, ErrNaoEncontrado
		}
		return t, err
	}
	t.OrigemID = strNula(origem)
	t.Status = dominio.Status(status)
	t.Consentimento = consent == 1
	t.Exemplo = exemplo == 1
	t.CriteriosUsados = []string{}
	_ = json.Unmarshal([]byte(crit), &t.CriteriosUsados)
	t.CriadoPor = strNula(criadoPor)
	t.CriadoEm = deMs(criado)
	t.AtualizadoEm = deMs(atualizado)
	t.AvaliadoEm = deMsNulo(avaliado)
	t.EnviadoEm = deMsNulo(enviado)
	t.EnviadoPor = strNula(enviadoPor)
	t.Palavras = dominio.ContarPalavras(t.Conteudo)
	return t, nil
}

const colsApontamento = `id, texto_id, ordem, criterio, trecho, inicio, fim, sugestao, explicacao, variacao, decisao, sugestao_final, decidido_por, decidido_em`

func scanApontamento(r interface{ Scan(...any) error }) (dominio.Apontamento, error) {
	var a dominio.Apontamento
	var variacao int
	var decisao, final, por sql.NullString
	var em sql.NullInt64
	if err := r.Scan(&a.ID, &a.TextoID, &a.Ordem, &a.Criterio, &a.Trecho, &a.Inicio, &a.Fim, &a.Sugestao, &a.Explicacao,
		&variacao, &decisao, &final, &por, &em); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return a, ErrNaoEncontrado
		}
		return a, err
	}
	a.Variacao = variacao == 1
	if decisao.Valid {
		d := dominio.Decisao(decisao.String)
		a.Decisao = &d
	}
	a.SugestaoFinal = strNula(final)
	a.DecididoPor = strNula(por)
	a.DecididoEm = deMsNulo(em)
	return a, nil
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func inserirApontamentos(ctx context.Context, ex execer, textoID string, aps []dominio.Apontamento) error {
	for i, a := range aps {
		if a.ID == "" {
			a.ID = NovoID()
		}
		var dec any
		if a.Decisao != nil {
			dec = string(*a.Decisao)
		}
		var em any
		if a.DecididoEm != nil {
			em = ms(*a.DecididoEm)
		}
		if _, err := ex.ExecContext(ctx, `INSERT INTO apontamentos (`+colsApontamento+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			a.ID, textoID, i, a.Criterio, a.Trecho, a.Inicio, a.Fim, a.Sugestao, a.Explicacao, b2i(a.Variacao),
			dec, nulo(a.SugestaoFinal), nulo(a.DecididoPor), em); err != nil {
			return err
		}
	}
	return nil
}

// CriarTexto insere um texto (e seus apontamentos, quando houver).
func (s *Store) CriarTexto(ctx context.Context, t dominio.Texto) (dominio.Texto, error) {
	if t.ID == "" {
		t.ID = NovoID()
	}
	agora := s.now().UTC()
	if t.CriadoEm.IsZero() {
		t.CriadoEm = agora
	}
	if t.AtualizadoEm.IsZero() {
		t.AtualizadoEm = t.CriadoEm
	}
	if t.CriteriosUsados == nil {
		t.CriteriosUsados = []string{}
	}
	crit, _ := json.Marshal(t.CriteriosUsados)
	var avaliado, enviado any
	if t.AvaliadoEm != nil {
		avaliado = ms(*t.AvaliadoEm)
	}
	if t.EnviadoEm != nil {
		enviado = ms(*t.EnviadoEm)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return t, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO textos (id, aluno_codigo, turma, grupo, titulo, versao, origem_id, conteudo, status,
		consentimento, exemplo, motor, criterios_usados, comentario_ia, comentario_professor, descartados, erro_correcao,
		criado_por, criado_em, atualizado_em, avaliado_em, enviado_em, enviado_por)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.AlunoCodigo, t.Turma, t.Grupo, t.Titulo, t.Versao, nulo(t.OrigemID), t.Conteudo, string(t.Status),
		b2i(t.Consentimento), b2i(t.Exemplo), t.Motor, string(crit), t.ComentarioIA, t.ComentarioProfessor, t.Descartados, t.ErroCorrecao,
		nulo(t.CriadoPor), ms(t.CriadoEm), ms(t.AtualizadoEm), avaliado, enviado, nulo(t.EnviadoPor))
	if err != nil {
		return t, err
	}
	if err := inserirApontamentos(ctx, tx, t.ID, t.Apontamentos); err != nil {
		return t, err
	}
	if err := tx.Commit(); err != nil {
		return t, err
	}
	return s.BuscarTexto(ctx, t.ID, true)
}

func (s *Store) BuscarTexto(ctx context.Context, id string, comApontamentos bool) (dominio.Texto, error) {
	t, err := scanTexto(s.db.QueryRowContext(ctx, `SELECT `+colsTexto+` FROM textos t WHERE t.id = ?`, id))
	if err != nil || !comApontamentos {
		return t, err
	}
	t.Apontamentos, err = s.listarApontamentos(ctx, s.db, id)
	return t, err
}

type consultor interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func (s *Store) listarApontamentos(ctx context.Context, q consultor, textoID string) ([]dominio.Apontamento, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+colsApontamento+` FROM apontamentos WHERE texto_id = ? ORDER BY ordem`, textoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dominio.Apontamento{}
	for rows.Next() {
		a, err := scanApontamento(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type FiltroTextos struct {
	Status      string
	Turma       string
	Grupo       string
	AlunoCodigo string
}

func (f FiltroTextos) where() (string, []any) {
	var cond []string
	var args []any
	add := func(c string, v string) {
		if v != "" {
			cond = append(cond, c)
			args = append(args, v)
		}
	}
	add("t.status = ?", f.Status)
	add("t.turma = ?", f.Turma)
	add("t.grupo = ?", f.Grupo)
	add("t.aluno_codigo = ?", f.AlunoCodigo)
	if len(cond) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(cond, " AND "), args
}

// ListarTextos devolve os textos sem os apontamentos, mais recentes primeiro.
func (s *Store) ListarTextos(ctx context.Context, f FiltroTextos) ([]dominio.Texto, error) {
	w, args := f.where()
	rows, err := s.db.QueryContext(ctx, `SELECT `+colsTexto+` FROM textos t`+w+` ORDER BY t.criado_em DESC, t.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dominio.Texto{}
	for rows.Next() {
		t, err := scanTexto(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListarTextosCompletos devolve os textos com os apontamentos (para as métricas).
func (s *Store) ListarTextosCompletos(ctx context.Context, f FiltroTextos) ([]dominio.Texto, error) {
	textos, err := s.ListarTextos(ctx, f)
	if err != nil {
		return nil, err
	}
	idx := make(map[string]int, len(textos))
	for i, t := range textos {
		idx[t.ID] = i
		textos[i].Apontamentos = []dominio.Apontamento{}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+colsApontamento+` FROM apontamentos ORDER BY texto_id, ordem`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		a, err := scanApontamento(rows)
		if err != nil {
			return nil, err
		}
		if i, ok := idx[a.TextoID]; ok {
			textos[i].Apontamentos = append(textos[i].Apontamentos, a)
		}
	}
	return textos, rows.Err()
}

func (s *Store) ExcluirTexto(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM textos WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNaoEncontrado
	}
	return nil
}

func (s *Store) ExcluirExemplos(ctx context.Context) (int, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM textos WHERE exemplo = 1`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// ---------- correção ----------

// IniciarCorrecao marca o texto como "corrigindo". Só vale para textos
// pendentes ou em revisão (uma nova correção descarta as decisões anteriores).
func (s *Store) IniciarCorrecao(ctx context.Context, id string) (dominio.Texto, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return dominio.Texto{}, err
	}
	defer tx.Rollback()
	t, err := scanTexto(tx.QueryRowContext(ctx, `SELECT `+colsTexto+` FROM textos t WHERE t.id = ?`, id))
	if err != nil {
		return t, err
	}
	switch t.Status {
	case dominio.StatusCorrigindo:
		return t, ErrConflito{"A correção deste texto já está em andamento."}
	case dominio.StatusConcluido:
		return t, ErrConflito{"A devolutiva deste texto já foi enviada e não pode ser corrigida de novo."}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE textos SET status = 'corrigindo', erro_correcao = '', atualizado_em = ? WHERE id = ?`, ms(s.now()), id); err != nil {
		return t, err
	}
	if err := tx.Commit(); err != nil {
		return t, err
	}
	t.Status = dominio.StatusCorrigindo
	t.ErroCorrecao = ""
	return t, nil
}

type ResultadoCorrecao struct {
	Motor        string
	Criterios    []string
	Apontamentos []dominio.Apontamento
	Comentario   string
	Descartados  int
}

// SalvarCorrecao grava o resultado e coloca o texto em revisão.
func (s *Store) SalvarCorrecao(ctx context.Context, id string, r ResultadoCorrecao) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM textos WHERE id = ?`, id).Scan(&status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNaoEncontrado
		}
		return err
	}
	if status != string(dominio.StatusCorrigindo) {
		return ErrConflito{fmt.Sprintf("o texto não está em correção (status %s)", status)}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM apontamentos WHERE texto_id = ?`, id); err != nil {
		return err
	}
	if err := inserirApontamentos(ctx, tx, id, r.Apontamentos); err != nil {
		return err
	}
	crit, _ := json.Marshal(r.Criterios)
	agora := ms(s.now())
	if _, err := tx.ExecContext(ctx, `UPDATE textos SET status = 'revisao', motor = ?, criterios_usados = ?, comentario_ia = ?,
		comentario_professor = ?, descartados = ?, erro_correcao = '', avaliado_em = ?, atualizado_em = ? WHERE id = ?`,
		r.Motor, string(crit), r.Comentario, r.Comentario, r.Descartados, agora, agora, id); err != nil {
		return err
	}
	return tx.Commit()
}

// FalharCorrecao devolve o texto ao estado anterior à correção, com a mensagem de erro.
func (s *Store) FalharCorrecao(ctx context.Context, id, mensagem string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE textos SET
		status = CASE WHEN avaliado_em IS NULL THEN 'pendente' ELSE 'revisao' END,
		erro_correcao = ?, atualizado_em = ? WHERE id = ? AND status = 'corrigindo'`, mensagem, ms(s.now()), id)
	return err
}

// ResetarCorrecoesInterrompidas libera textos que ficaram "corrigindo" após uma parada do servidor.
func (s *Store) ResetarCorrecoesInterrompidas(ctx context.Context) (int, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE textos SET
		status = CASE WHEN avaliado_em IS NULL THEN 'pendente' ELSE 'revisao' END,
		erro_correcao = 'A correção foi interrompida. Tente de novo.', atualizado_em = ? WHERE status = 'corrigindo'`, ms(s.now()))
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// ---------- revisão do professor ----------

func exigirRevisao(ctx context.Context, tx *sql.Tx, id string) error {
	var status string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM textos WHERE id = ?`, id).Scan(&status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNaoEncontrado
		}
		return err
	}
	switch dominio.Status(status) {
	case dominio.StatusRevisao:
		return nil
	case dominio.StatusConcluido:
		return ErrConflito{"A devolutiva já foi enviada. As decisões não podem mais ser alteradas."}
	case dominio.StatusCorrigindo:
		return ErrConflito{"A correção ainda está em andamento."}
	default:
		return ErrConflito{"O texto ainda não foi corrigido."}
	}
}

// Decidir registra a decisão do professor sobre um apontamento.
// decisao nil desfaz a decisão.
func (s *Store) Decidir(ctx context.Context, textoID, apID string, decisao *dominio.Decisao, final *string, usuarioID string) (dominio.Apontamento, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return dominio.Apontamento{}, err
	}
	defer tx.Rollback()
	if err := exigirRevisao(ctx, tx, textoID); err != nil {
		return dominio.Apontamento{}, err
	}
	agora := ms(s.now())
	var res sql.Result
	if decisao == nil {
		res, err = tx.ExecContext(ctx, `UPDATE apontamentos SET decisao = NULL, sugestao_final = NULL, decidido_por = NULL, decidido_em = NULL WHERE id = ? AND texto_id = ?`, apID, textoID)
	} else {
		res, err = tx.ExecContext(ctx, `UPDATE apontamentos SET decisao = ?, sugestao_final = ?, decidido_por = ?, decidido_em = ? WHERE id = ? AND texto_id = ?`,
			string(*decisao), nulo(final), usuarioID, agora, apID, textoID)
	}
	if err != nil {
		return dominio.Apontamento{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return dominio.Apontamento{}, ErrNaoEncontrado
	}
	if _, err := tx.ExecContext(ctx, `UPDATE textos SET atualizado_em = ? WHERE id = ?`, agora, textoID); err != nil {
		return dominio.Apontamento{}, err
	}
	a, err := scanApontamento(tx.QueryRowContext(ctx, `SELECT `+colsApontamento+` FROM apontamentos WHERE id = ?`, apID))
	if err != nil {
		return a, err
	}
	return a, tx.Commit()
}

// DecidirTodos aceita ou recusa toda a correção de uma vez.
func (s *Store) DecidirTodos(ctx context.Context, textoID string, decisao dominio.Decisao, usuarioID string) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if err := exigirRevisao(ctx, tx, textoID); err != nil {
		return 0, err
	}
	agora := ms(s.now())
	res, err := tx.ExecContext(ctx, `UPDATE apontamentos SET decisao = ?, sugestao_final = NULL, decidido_por = ?, decidido_em = ? WHERE texto_id = ?`,
		string(decisao), usuarioID, agora, textoID)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if _, err := tx.ExecContext(ctx, `UPDATE textos SET atualizado_em = ? WHERE id = ?`, agora, textoID); err != nil {
		return 0, err
	}
	return int(n), tx.Commit()
}

func (s *Store) AtualizarComentario(ctx context.Context, textoID, comentario string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := exigirRevisao(ctx, tx, textoID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE textos SET comentario_professor = ?, atualizado_em = ? WHERE id = ?`, comentario, ms(s.now()), textoID); err != nil {
		return err
	}
	return tx.Commit()
}

// Enviar conclui a revisão. Exige que todos os apontamentos tenham decisão.
func (s *Store) Enviar(ctx context.Context, textoID string, comentario *string, usuarioID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := exigirRevisao(ctx, tx, textoID); err != nil {
		return err
	}
	var pendentes int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM apontamentos WHERE texto_id = ? AND decisao IS NULL`, textoID).Scan(&pendentes); err != nil {
		return err
	}
	if pendentes > 0 {
		return ErrConflito{fmt.Sprintf("Decida os %d apontamentos pendentes antes de enviar.", pendentes)}
	}
	agora := ms(s.now())
	if comentario != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE textos SET comentario_professor = ? WHERE id = ?`, *comentario, textoID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE textos SET status = 'concluido', enviado_em = ?, enviado_por = ?, atualizado_em = ? WHERE id = ?`,
		agora, usuarioID, agora, textoID); err != nil {
		return err
	}
	return tx.Commit()
}
