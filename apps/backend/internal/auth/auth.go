// Package auth trata senhas, tokens de sessão e limite de tentativas de login.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Iteracoes do PBKDF2-SHA256 (recomendação OWASP 2023: 600.000).
// Os testes reduzem esse valor para rodar rápido.
var Iteracoes = 600_000

const TamanhoMinimoSenha = 10

var ErrSenhaFraca = fmt.Errorf("a senha precisa ter pelo menos %d caracteres", TamanhoMinimoSenha)

// GerarHash devolve o hash da senha no formato pbkdf2-sha256$iter$sal$hash.
func GerarHash(senha string) (string, error) {
	if len([]rune(senha)) < TamanhoMinimoSenha {
		return "", ErrSenhaFraca
	}
	sal := make([]byte, 16)
	if _, err := rand.Read(sal); err != nil {
		return "", err
	}
	h, err := pbkdf2.Key(sha256.New, senha, sal, Iteracoes, 32)
	if err != nil {
		return "", err
	}
	enc := base64.RawStdEncoding
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", Iteracoes, enc.EncodeToString(sal), enc.EncodeToString(h)), nil
}

// hashFalso é usado quando o e-mail não existe, para o tempo de resposta não revelar isso.
func hashFalso() string {
	sal := base64.RawStdEncoding.EncodeToString(make([]byte, 16))
	return "pbkdf2-sha256$" + strconv.Itoa(Iteracoes) + "$" + sal + "$" + sal
}

// ConferirSenha compara a senha com o hash em tempo constante.
// Com hash vazio, faz o mesmo trabalho e devolve false.
func ConferirSenha(senha, hash string) bool {
	if hash == "" {
		hash = hashFalso()
	}
	partes := strings.Split(hash, "$")
	if len(partes) != 4 || partes[0] != "pbkdf2-sha256" {
		return false
	}
	iter, err := strconv.Atoi(partes[1])
	if err != nil || iter < 1 {
		return false
	}
	enc := base64.RawStdEncoding
	sal, err1 := enc.DecodeString(partes[2])
	esperado, err2 := enc.DecodeString(partes[3])
	if err1 != nil || err2 != nil || len(esperado) == 0 {
		return false
	}
	h, err := pbkdf2.Key(sha256.New, senha, sal, iter, len(esperado))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(h, esperado) == 1
}

// NovoToken devolve um token de sessão aleatório e o hash guardado no banco.
func NovoToken() (token, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashToken(token), nil
}

// HashToken devolve o SHA-256 do token. O token em si nunca é gravado.
func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// SenhaAleatoria gera uma senha inicial para o administrador.
func SenhaAleatoria() string {
	b := make([]byte, 15)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// Limitador bloqueia um e-mail depois de várias senhas erradas seguidas.
type Limitador struct {
	mu     sync.Mutex
	falhas map[string][]time.Time
	Max    int
	Janela time.Duration
	agora  func() time.Time
}

func NovoLimitador(max int, janela time.Duration) *Limitador {
	return &Limitador{falhas: map[string][]time.Time{}, Max: max, Janela: janela, agora: time.Now}
}

var ErrMuitasTentativas = errors.New("muitas tentativas de login")

func (l *Limitador) recentes(chave string) []time.Time {
	lim := l.agora().Add(-l.Janela)
	var out []time.Time
	for _, t := range l.falhas[chave] {
		if t.After(lim) {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		delete(l.falhas, chave)
	} else {
		l.falhas[chave] = out
	}
	return out
}

// Permitido diz se a chave ainda pode tentar o login.
func (l *Limitador) Permitido(chave string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recentes(chave)) < l.Max
}

func (l *Limitador) Falhou(chave string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.falhas[chave] = append(l.recentes(chave), l.agora())
}

func (l *Limitador) Limpar(chave string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.falhas, chave)
}
