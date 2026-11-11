// Package config lê a configuração do servidor a partir de variáveis de ambiente.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Endereco string // ADDR
	BancoArq string // DB_PATH

	AnthropicAPIKey  string // ANTHROPIC_API_KEY
	AnthropicModelo  string // ANTHROPIC_MODEL
	AnthropicBaseURL string // ANTHROPIC_BASE_URL
	AnthropicVersao  string // ANTHROPIC_VERSION

	CorrecaoConcorrencia int           // CORRECAO_CONCORRENCIA
	CorrecaoTimeout      time.Duration // CORRECAO_TIMEOUT

	SessaoDuracao time.Duration // SESSAO_DURACAO

	AdminEmail string // ADMIN_EMAIL
	AdminSenha string // ADMIN_SENHA
	AdminNome  string // ADMIN_NOME

	CORSOrigens  []string // CORS_ORIGENS (separadas por vírgula)
	DirEstatico  string   // STATIC_DIR
	SeedExemplos bool     // SEED_EXEMPLOS
	MaxUploadMB  int      // MAX_UPLOAD_MB
}

func Carregar() (Config, error) {
	c := Config{
		Endereco:             env("ADDR", ":8080"),
		BancoArq:             env("DB_PATH", "./dados/corretor.db"),
		AnthropicAPIKey:      os.Getenv("ANTHROPIC_API_KEY"),
		AnthropicModelo:      env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
		AnthropicBaseURL:     strings.TrimRight(env("ANTHROPIC_BASE_URL", "https://api.anthropic.com"), "/"),
		AnthropicVersao:      env("ANTHROPIC_VERSION", "2026-10-21"),
		AdminEmail:           os.Getenv("ADMIN_EMAIL"),
		AdminSenha:           os.Getenv("ADMIN_SENHA"),
		AdminNome:            env("ADMIN_NOME", "Administrador"),
		DirEstatico:          os.Getenv("STATIC_DIR"),
		CorrecaoConcorrencia: 4,
		CorrecaoTimeout:      150 * time.Second,
		SessaoDuracao:        12 * time.Hour,
		MaxUploadMB:          10,
	}
	var err error
	if c.CorrecaoConcorrencia, err = envInt("CORRECAO_CONCORRENCIA", c.CorrecaoConcorrencia, 1, 64); err != nil {
		return c, err
	}
	if c.MaxUploadMB, err = envInt("MAX_UPLOAD_MB", c.MaxUploadMB, 1, 100); err != nil {
		return c, err
	}
	if c.CorrecaoTimeout, err = envDur("CORRECAO_TIMEOUT", c.CorrecaoTimeout); err != nil {
		return c, err
	}
	if c.SessaoDuracao, err = envDur("SESSAO_DURACAO", c.SessaoDuracao); err != nil {
		return c, err
	}
	if v := os.Getenv("SEED_EXEMPLOS"); v != "" {
		c.SeedExemplos, err = strconv.ParseBool(v)
		if err != nil {
			return c, fmt.Errorf("SEED_EXEMPLOS: use true ou false")
		}
	}
	for _, o := range strings.Split(os.Getenv("CORS_ORIGENS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.CORSOrigens = append(c.CORSOrigens, o)
		}
	}
	return c, nil
}

func env(k, padrao string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return padrao
}

func envInt(k string, padrao, min, max int) (int, error) {
	v := os.Getenv(k)
	if v == "" {
		return padrao, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < min || n > max {
		return 0, fmt.Errorf("%s: use um número entre %d e %d", k, min, max)
	}
	return n, nil
}

func envDur(k string, padrao time.Duration) (time.Duration, error) {
	v := os.Getenv(k)
	if v == "" {
		return padrao, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("%s: use uma duração como 90s ou 12h", k)
	}
	return d, nil
}
