// Package store persiste os dados em SQLite usando database/sql.
//
// As consultas usam SQL portável; trocar por PostgreSQL exige ajustar o
// driver, os marcadores de parâmetro ($1) e as migrações.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"corretor-textual/internal/dominio"
)

var (
	ErrNaoEncontrado = errors.New("não encontrado")
	ErrEmailEmUso    = errors.New("e-mail já cadastrado")
)

// ErrConflito indica que o estado atual do registro não permite a operação.
type ErrConflito struct{ Motivo string }

func (e ErrConflito) Error() string { return e.Motivo }

//go:embed migrations/*.sql
var migracoes embed.FS

type Store struct {
	db  *sql.DB
	now func() time.Time
}

// Abrir abre (ou cria) o banco e aplica as migrações pendentes.
func Abrir(caminho string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000&_txlock=immediate", caminho)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("abrir banco %s: %w", caminho, err)
	}
	s := &Store{db: db, now: time.Now}
	if err := s.migrar(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Fechar() error { return s.db.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) migrar(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migracoes (versao INTEGER PRIMARY KEY, aplicada_em INTEGER NOT NULL)`); err != nil {
		return err
	}
	arquivos, err := fs.Glob(migracoes, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(arquivos)
	for _, arq := range arquivos {
		nome := strings.TrimPrefix(arq, "migrations/")
		versao, err := strconv.Atoi(strings.SplitN(nome, "_", 2)[0])
		if err != nil {
			return fmt.Errorf("migração com nome inválido: %s", nome)
		}
		var existe int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migracoes WHERE versao = ?`, versao).Scan(&existe); err != nil {
			return err
		}
		if existe > 0 {
			continue
		}
		sqlTxt, err := migracoes.ReadFile(arq)
		if err != nil {
			return err
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(sqlTxt)); err != nil {
			tx.Rollback()
			return fmt.Errorf("migração %s: %w", nome, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migracoes (versao, aplicada_em) VALUES (?, ?)`, versao, ms(s.now())); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// NovoID gera um identificador aleatório curto.
func NovoID() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

func ms(t time.Time) int64 { return t.UnixMilli() }

func deMs(v int64) time.Time { return time.UnixMilli(v).UTC() }

func deMsNulo(v sql.NullInt64) *time.Time {
	if !v.Valid {
		return nil
	}
	t := deMs(v.Int64)
	return &t
}

func strNula(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

func nulo(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ---------- usuários e sessões ----------

func (s *Store) ContarUsuarios(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM usuarios`).Scan(&n)
	return n, err
}

func (s *Store) CriarUsuario(ctx context.Context, u dominio.Usuario, senhaHash string) (dominio.Usuario, error) {
	if u.ID == "" {
		u.ID = NovoID()
	}
	u.CriadoEm = s.now().UTC()
	_, err := s.db.ExecContext(ctx, `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.Nome, strings.ToLower(u.Email), senhaHash, string(u.Perfil), b2i(u.Ativo), ms(u.CriadoEm))
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return u, ErrEmailEmUso
	}
	u.Email = strings.ToLower(u.Email)
	return u, err
}

const colsUsuario = `id, nome, email, perfil, ativo, criado_em`

func scanUsuario(r interface{ Scan(...any) error }, extra ...any) (dominio.Usuario, error) {
	var u dominio.Usuario
	var perfil string
	var ativo int
	var criado int64
	dest := append([]any{&u.ID, &u.Nome, &u.Email, &perfil, &ativo, &criado}, extra...)
	if err := r.Scan(dest...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return u, ErrNaoEncontrado
		}
		return u, err
	}
	u.Perfil = dominio.Perfil(perfil)
	u.Ativo = ativo == 1
	u.CriadoEm = deMs(criado)
	return u, nil
}

// BuscarUsuarioPorEmail devolve o usuário e o hash da senha.
func (s *Store) BuscarUsuarioPorEmail(ctx context.Context, email string) (dominio.Usuario, string, error) {
	var hash string
	u, err := scanUsuario(s.db.QueryRowContext(ctx, `SELECT `+colsUsuario+`, senha_hash FROM usuarios WHERE email = ?`, strings.ToLower(strings.TrimSpace(email))), &hash)
	return u, hash, err
}

func (s *Store) BuscarUsuario(ctx context.Context, id string) (dominio.Usuario, error) {
	return scanUsuario(s.db.QueryRowContext(ctx, `SELECT `+colsUsuario+` FROM usuarios WHERE id = ?`, id))
}

func (s *Store) ListarUsuarios(ctx context.Context) ([]dominio.Usuario, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+colsUsuario+` FROM usuarios ORDER BY nome`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dominio.Usuario{}
	for rows.Next() {
		u, err := scanUsuario(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// AlteracaoUsuario descreve campos opcionais a alterar.
type AlteracaoUsuario struct {
	Nome      *string
	Perfil    *dominio.Perfil
	Ativo     *bool
	SenhaHash *string
}

func (s *Store) AtualizarUsuario(ctx context.Context, id string, a AlteracaoUsuario) (dominio.Usuario, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return dominio.Usuario{}, err
	}
	defer tx.Rollback()
	if _, err := scanUsuario(tx.QueryRowContext(ctx, `SELECT `+colsUsuario+` FROM usuarios WHERE id = ?`, id)); err != nil {
		return dominio.Usuario{}, err
	}
	if a.Nome != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET nome = ? WHERE id = ?`, *a.Nome, id); err != nil {
			return dominio.Usuario{}, err
		}
	}
	if a.Perfil != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET perfil = ? WHERE id = ?`, string(*a.Perfil), id); err != nil {
			return dominio.Usuario{}, err
		}
	}
	if a.Ativo != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET ativo = ? WHERE id = ?`, b2i(*a.Ativo), id); err != nil {
			return dominio.Usuario{}, err
		}
	}
	if a.SenhaHash != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET senha_hash = ? WHERE id = ?`, *a.SenhaHash, id); err != nil {
			return dominio.Usuario{}, err
		}
	}
	// Desativar, trocar perfil ou senha encerra as sessões abertas.
	if a.Ativo != nil || a.Perfil != nil || a.SenhaHash != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM sessoes WHERE usuario_id = ?`, id); err != nil {
			return dominio.Usuario{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return dominio.Usuario{}, err
	}
	return s.BuscarUsuario(ctx, id)
}

func (s *Store) CriarSessao(ctx context.Context, tokenHash, usuarioID string, expira time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessoes (token_hash, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)`,
		tokenHash, usuarioID, ms(s.now()), ms(expira))
	return err
}

// BuscarSessao devolve o usuário ativo dono de uma sessão válida.
func (s *Store) BuscarSessao(ctx context.Context, tokenHash string) (dominio.Usuario, error) {
	return scanUsuario(s.db.QueryRowContext(ctx, `SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.criado_em
		FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
		WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`, tokenHash, ms(s.now())))
}

func (s *Store) RemoverSessao(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessoes WHERE token_hash = ?`, tokenHash)
	return err
}

func (s *Store) LimparSessoesExpiradas(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessoes WHERE expira_em <= ?`, ms(s.now()))
	return err
}

// ---------- configuração ----------

func (s *Store) ObterConfiguracao(ctx context.Context) (dominio.Configuracao, error) {
	var c dominio.Configuracao
	var crit, grupos string
	var atualizado int64
	var por sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT criterios, grupos, limiar_vies, atualizado_em, atualizado_por FROM configuracao WHERE id = 1`).
		Scan(&crit, &grupos, &c.LimiarVies, &atualizado, &por)
	if errors.Is(err, sql.ErrNoRows) {
		c = dominio.ConfiguracaoPadrao()
		c.AtualizadoEm = s.now().UTC()
		return c, s.SalvarConfiguracao(ctx, c, nil)
	}
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal([]byte(crit), &c.Criterios); err != nil {
		return c, err
	}
	if err := json.Unmarshal([]byte(grupos), &c.Grupos); err != nil {
		return c, err
	}
	c.AtualizadoEm = deMs(atualizado)
	c.AtualizadoPor = strNula(por)
	return c, nil
}

func (s *Store) SalvarConfiguracao(ctx context.Context, c dominio.Configuracao, por *string) error {
	crit, _ := json.Marshal(c.Criterios)
	grupos, _ := json.Marshal(c.Grupos)
	_, err := s.db.ExecContext(ctx, `INSERT INTO configuracao (id, criterios, grupos, limiar_vies, atualizado_em, atualizado_por)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET criterios = excluded.criterios, grupos = excluded.grupos,
		limiar_vies = excluded.limiar_vies, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
		string(crit), string(grupos), c.LimiarVies, ms(s.now()), nulo(por))
	return err
}

// ---------- auditoria ----------

func (s *Store) Auditar(ctx context.Context, usuarioID *string, acao, entidade, entidadeID, detalhe string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, detalhe, criado_em) VALUES (?, ?, ?, ?, ?, ?)`,
		nulo(usuarioID), acao, entidade, entidadeID, detalhe, ms(s.now()))
	return err
}

func (s *Store) ListarAuditoria(ctx context.Context, limite int) ([]dominio.RegistroAuditoria, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, usuario_id, acao, entidade, entidade_id, detalhe, criado_em FROM auditoria ORDER BY id DESC LIMIT ?`, limite)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dominio.RegistroAuditoria{}
	for rows.Next() {
		var r dominio.RegistroAuditoria
		var uid sql.NullString
		var criado int64
		if err := rows.Scan(&r.ID, &uid, &r.Acao, &r.Entidade, &r.EntidadeID, &r.Detalhe, &criado); err != nil {
			return nil, err
		}
		r.UsuarioID = strNula(uid)
		r.CriadoEm = deMs(criado)
		out = append(out, r)
	}
	return out, rows.Err()
}
