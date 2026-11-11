package auth

import (
	"strings"
	"testing"
	"time"
)

func TestSenha(t *testing.T) {
	Iteracoes = 1000
	if _, err := GerarHash("curta"); err != ErrSenhaFraca {
		t.Fatalf("senha curta devia falhar: %v", err)
	}
	h, err := GerarHash("uma senha longa")
	if err != nil || !strings.HasPrefix(h, "pbkdf2-sha256$1000$") {
		t.Fatalf("hash = %q, %v", h, err)
	}
	if !ConferirSenha("uma senha longa", h) || ConferirSenha("outra senha longa", h) || ConferirSenha("x", "") || ConferirSenha("x", "lixo") {
		t.Fatal("conferência de senha incorreta")
	}
}

func TestToken(t *testing.T) {
	tok, hash, err := NovoToken()
	if err != nil || len(tok) < 40 || HashToken(tok) != hash || strings.Contains(hash, tok) {
		t.Fatalf("token inválido: %q %q %v", tok, hash, err)
	}
}

func TestLimitador(t *testing.T) {
	l := NovoLimitador(2, time.Minute)
	agora := time.Now()
	l.agora = func() time.Time { return agora }
	l.Falhou("a")
	l.Falhou("a")
	if l.Permitido("a") || !l.Permitido("b") {
		t.Fatal("limite não aplicado")
	}
	agora = agora.Add(2 * time.Minute)
	if !l.Permitido("a") {
		t.Fatal("a janela devia expirar")
	}
}
