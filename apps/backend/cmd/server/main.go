// Comando server sobe a API do Corretor Textual 3.000 (POC 1.3).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"corretor-textual/internal/api"
	"corretor-textual/internal/auth"
	"corretor-textual/internal/config"
	"corretor-textual/internal/corretor"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/exemplos"
	"corretor-textual/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if err := executar(log); err != nil {
		log.Error("encerrando com erro", "erro", err)
		os.Exit(1)
	}
}

func executar(log *slog.Logger) error {
	cfg, err := config.Carregar()
	if err != nil {
		return err
	}
	if dir := filepath.Dir(cfg.BancoArq); dir != "" {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return err
		}
	}
	st, err := store.Abrir(cfg.BancoArq)
	if err != nil {
		return err
	}
	defer st.Fechar()

	ctx := context.Background()
	if n, err := st.ResetarCorrecoesInterrompidas(ctx); err != nil {
		return err
	} else if n > 0 {
		log.Warn("correções interrompidas liberadas", "textos", n)
	}
	if err := criarAdminInicial(ctx, st, cfg, log); err != nil {
		return err
	}
	if _, err := st.ObterConfiguracao(ctx); err != nil {
		return err
	}
	if cfg.SeedExemplos {
		n, err := exemplos.Carregar(ctx, st, nil)
		if err != nil {
			return err
		}
		log.Info("textos de exemplo carregados", "criados", n)
	}

	var ia corretor.Motor
	if cfg.AnthropicAPIKey != "" {
		ia = &corretor.Anthropic{
			APIKey: cfg.AnthropicAPIKey, Modelo: cfg.AnthropicModelo, BaseURL: cfg.AnthropicBaseURL,
			Versao: cfg.AnthropicVersao, HTTP: &http.Client{Timeout: cfg.CorrecaoTimeout},
		}
		log.Info("correção por IA ativa", "modelo", cfg.AnthropicModelo)
	} else {
		log.Warn("ANTHROPIC_API_KEY não definida: só a correção simulada está disponível")
	}

	srv := api.Novo(st, cfg, log, ia)
	httpSrv := &http.Server{
		Addr:              cfg.Endereco,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      cfg.CorrecaoTimeout + 30*time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	sinais, parar := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer parar()
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-sinais.Done():
				return
			case <-t.C:
				if err := st.LimparSessoesExpiradas(context.Background()); err != nil {
					log.Error("falha ao limpar sessões", "erro", err)
				}
			}
		}
	}()

	erros := make(chan error, 1)
	go func() {
		log.Info("servidor no ar", "endereco", cfg.Endereco)
		erros <- httpSrv.ListenAndServe()
	}()
	select {
	case err := <-erros:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-sinais.Done():
		log.Info("encerrando")
	}
	ctxFim, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctxFim)
	srv.Encerrar(ctxFim)
	return nil
}

// criarAdminInicial cria o primeiro administrador quando o banco está vazio.
func criarAdminInicial(ctx context.Context, st *store.Store, cfg config.Config, log *slog.Logger) error {
	n, err := st.ContarUsuarios(ctx)
	if err != nil || n > 0 {
		return err
	}
	email := cfg.AdminEmail
	if email == "" {
		email = "admin@corretor.local"
	}
	senha := cfg.AdminSenha
	gerada := senha == ""
	if gerada {
		senha = auth.SenhaAleatoria()
	}
	hash, err := auth.GerarHash(senha)
	if err != nil {
		return errors.New("ADMIN_SENHA: " + err.Error())
	}
	if _, err := st.CriarUsuario(ctx, dominio.Usuario{Nome: cfg.AdminNome, Email: email, Perfil: dominio.PerfilAdmin, Ativo: true}, hash); err != nil {
		return err
	}
	if gerada {
		// Exibida uma única vez, no primeiro início. Troque-a depois do primeiro login.
		log.Warn("administrador inicial criado com senha gerada", "email", email, "senha", senha)
	} else {
		log.Info("administrador inicial criado", "email", email)
	}
	return nil
}
