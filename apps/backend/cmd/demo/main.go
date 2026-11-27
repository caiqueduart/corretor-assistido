// Comando demo recria um banco de demonstração do Corretor Assistido com
// usuários, turmas, propostas, redações em todas as situações, decisões,
// códigos de acesso e histórico das últimas semanas. Todo o conteúdo é fictício.
//
//	go run ./cmd/demo -recriar          # cria dados/demo.db
//	DB_PATH=dados/demo.db go run ./cmd/server
package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"corretor-textual/internal/auth"
	"corretor-textual/internal/corretor"
	"corretor-textual/internal/dominio"
	"corretor-textual/internal/store"
)

type usuarioDemo struct {
	nome, email, senha string
	perfil             dominio.Perfil
	ativo              bool
}

var usuariosDemo = []usuarioDemo{
	{"Ana Souza", "admin@escola.exemplo", "senha-de-teste-123", dominio.PerfilAdmin, true},
	{"Paula Ribeiro", "professor@escola.exemplo", "senha-professor-1", dominio.PerfilProfessor, true},
	{"João Mendes", "joao@escola.exemplo", "senha-professor-2", dominio.PerfilProfessor, true},
	{"Carla Nunes", "carla@escola.exemplo", "senha-professor-3", dominio.PerfilProfessor, true},
	{"Lia Coordenação", "lia@escola.exemplo", "senha-leitura-1", dominio.PerfilLeitura, true},
	{"Bruno Oliveira", "bruno@escola.exemplo", "senha-professor-4", dominio.PerfilProfessor, false},
}

// Códigos conhecidos para demonstrar a Área do aluno.
var codigosDemo = map[string]string{
	"Jequitibá Coral": "DEMO-0001", // 9º A, ainda não enviou a proposta aberta
	"Preguiça Oliva":  "DEMO-0002", // 9º A, enviou e ainda pode trocar o texto
	"Ipê Lilás":       "DEMO-0003", // 8º A, tem devolutivas para ver
}

// Situações de uma redação na demonstração.
const (
	pendente  = "pendente"
	falhou    = "falhou"
	nova      = "revisao-nova"
	parcial   = "revisao-parcial"
	quase     = "revisao-quase"
	devolvida = "devolvida"
)

type demo struct {
	ctx      context.Context
	st       *store.Store
	rnd      *rand.Rand
	agora    time.Time
	usuarios map[string]dominio.Usuario // por e-mail
	cfg      dominio.Configuracao
	contagem map[string]int
	codigos  map[string]string // apelido → código (só para os arquivos da demonstração)
}

func main() {
	caminho := flag.String("db", "dados/demo.db", "arquivo SQLite a criar")
	recriar := flag.Bool("recriar", false, "apaga o arquivo se ele já existir")
	flag.Parse()

	if err := executar(*caminho, *recriar); err != nil {
		fmt.Fprintln(os.Stderr, "erro:", err)
		os.Exit(1)
	}
}

func executar(caminho string, recriar bool) error {
	if _, err := os.Stat(caminho); err == nil {
		if !recriar {
			return fmt.Errorf("%s já existe; use -recriar para apagá-lo e criar de novo", caminho)
		}
		for _, sufixo := range []string{"", "-wal", "-shm"} {
			if err := os.Remove(caminho + sufixo); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	if err := os.MkdirAll(filepath.Dir(caminho), 0o750); err != nil {
		return err
	}
	st, err := store.Abrir(caminho)
	if err != nil {
		return err
	}
	defer st.Fechar()

	auth.Iteracoes = 50_000 // só a demonstração: cria as contas mais rápido
	d := &demo{
		ctx:      context.Background(),
		st:       st,
		rnd:      rand.New(rand.NewPCG(2026, 13)),
		agora:    time.Now(),
		usuarios: map[string]dominio.Usuario{},
		contagem: map[string]int{},
	}
	passos := []func() error{d.criarUsuarios, d.configurar, d.criarConteudo}
	for _, passo := range passos {
		if err := passo(); err != nil {
			return err
		}
	}
	st.UsarRelogio(time.Now)
	return d.resumo(filepath.Dir(caminho))
}

// em devolve um horário "dias" atrás, na hora e minuto indicados.
func (d *demo) em(dias int, hora, minuto int) time.Time {
	b := d.agora.AddDate(0, 0, -dias)
	return time.Date(b.Year(), b.Month(), b.Day(), hora, minuto, 0, 0, time.Local)
}

func (d *demo) relogio(t time.Time) { d.st.UsarRelogio(func() time.Time { return t }) }

func (d *demo) auditar(t time.Time, usuario *dominio.Usuario, acao, entidade, id, detalhe string) error {
	d.relogio(t)
	var uid *string
	if usuario != nil {
		uid = &usuario.ID
	}
	return d.st.Auditar(d.ctx, uid, acao, entidade, id, detalhe)
}

func (d *demo) criarUsuarios() error {
	d.relogio(d.em(30, 8, 0))
	for _, u := range usuariosDemo {
		hash, err := auth.GerarHash(u.senha)
		if err != nil {
			return err
		}
		criado, err := d.st.CriarUsuario(d.ctx, dominio.Usuario{Nome: u.nome, Email: u.email, Perfil: u.perfil, Ativo: true}, hash)
		if err != nil {
			return err
		}
		if !u.ativo {
			inativo := false
			if criado, err = d.st.AtualizarUsuario(d.ctx, criado.ID, store.AlteracaoUsuario{Ativo: &inativo}); err != nil {
				return err
			}
		}
		d.usuarios[u.email] = criado
	}
	admin := d.usuarios["admin@escola.exemplo"]
	for _, u := range usuariosDemo[1:] {
		if err := d.auditar(d.em(30, 8, 30), &admin, "criar_usuario", "usuario", d.usuarios[u.email].ID, "perfil="+string(u.perfil)); err != nil {
			return err
		}
	}
	return d.auditar(d.em(12, 17, 40), &admin, "alterar_usuario", "usuario", d.usuarios["bruno@escola.exemplo"].ID, "ativo=false")
}

func (d *demo) configurar() error {
	admin := d.usuarios["admin@escola.exemplo"]
	d.cfg = dominio.ConfiguracaoPadrao()
	d.cfg.Grupos = append(d.cfg.Grupos, "Quilombola")
	d.relogio(d.em(29, 9, 15))
	if err := d.st.SalvarConfiguracao(d.ctx, d.cfg, &admin.ID); err != nil {
		return err
	}
	return d.auditar(d.em(29, 9, 15), &admin, "alterar_config", "configuracao", "1",
		"criterios="+strings.Join(d.cfg.Criterios, ",")+" limiar=15")
}

// professorDa: Paula cuida do 8º ano e João do 9º.
func (d *demo) professorDa(turma string) dominio.Usuario {
	if strings.HasPrefix(turma, "9") {
		return d.usuarios["joao@escola.exemplo"]
	}
	return d.usuarios["professor@escola.exemplo"]
}

func alunosDa(turmas []string) []alunoDemo {
	var out []alunoDemo
	for _, a := range alunosDemo {
		if slices.Contains(turmas, a.turma) {
			out = append(out, a)
		}
	}
	return out
}

func (d *demo) criarConteudo() error {
	if err := d.gerarCodigos(); err != nil {
		return err
	}
	// Situações das entregas de cada proposta (na ordem dos alunos da turma).
	planos := [][]string{
		{devolvida, devolvida, parcial, quase, nova, pendente + "-aluno", falhou, pendente}, // mobilidade (9º A): 2 sem entrega
		{devolvida, devolvida, devolvida, devolvida, devolvida, devolvida, parcial, quase, nova, nova,
			pendente + "-aluno", pendente + "-aluno", pendente, pendente}, // memória (8º A e B): 6 sem entrega
		{devolvida, devolvida, devolvida, devolvida, devolvida, devolvida, parcial, nova, pendente}, // celular (9º A, vencida)
		{devolvida, devolvida, devolvida, devolvida, devolvida, devolvida, devolvida, devolvida,
			devolvida, devolvida, devolvida, devolvida, devolvida, devolvida, devolvida, devolvida}, // carta (encerrada)
		nil, // festa: sem redações ainda
	}
	for i, p := range propostasDemo {
		criada := d.em(p.criadaHa, 9, 0)
		autor := d.professorDa(p.turmas[0])
		prazo := d.agora.AddDate(0, 0, p.prazoDias).Format(time.DateOnly)
		d.relogio(criada)
		proposta, err := d.st.CriarProposta(d.ctx, dominio.Proposta{
			Tema: p.tema, Genero: p.genero, Enunciado: p.enunciado, Turmas: p.turmas, Prazo: &prazo, CriadoPor: &autor.ID,
		})
		if err != nil {
			return err
		}
		if err := d.auditar(criada, &autor, "criar_proposta", "proposta", proposta.ID, fmt.Sprintf("turmas=%d", len(p.turmas))); err != nil {
			return err
		}
		alunos := alunosDa(p.turmas)
		// Na mobilidade, quem tem o código DEMO-0001 ainda não entregou.
		if i == 0 {
			alunos = ordenarSemEntregaPorUltimo(alunos, "Jequitibá Coral")
		}
		for j, situacao := range planos[i] {
			if err := d.criarRedacao(alunos[j], p.tema, p.frases, situacao, criada, &proposta.ID); err != nil {
				return err
			}
		}
		if p.encerrada {
			encerrar := true
			fim := d.agora.AddDate(0, 0, p.prazoDias+1)
			d.relogio(fim)
			if _, err := d.st.AtualizarProposta(d.ctx, proposta.ID, store.AlteracaoProposta{Encerrada: &encerrar}); err != nil {
				return err
			}
			if err := d.auditar(fim, &autor, "alterar_proposta", "proposta", proposta.ID, "encerrada=true"); err != nil {
				return err
			}
		}
		d.contagem["propostas"]++
	}
	// Redações avulsas (sem proposta).
	avulsas := []struct {
		aluno    string
		situacao string
		dias     int
	}{
		{"Arara Índigo", devolvida, 18}, {"Mandacaru Bordô", devolvida, 14}, {"Boto Cinza", parcial, 4},
		{"Cutia Índigo", nova, 2}, {"Pequi Marfim", pendente, 1},
	}
	for _, a := range avulsas {
		if err := d.criarRedacao(buscarAluno(a.aluno), "Um fim de semana diferente", frasesAvulsas, a.situacao, d.em(a.dias, 10, 0), nil); err != nil {
			return err
		}
	}
	// Alguns acessos de hoje, para a atividade recente.
	for _, email := range []string{"professor@escola.exemplo", "joao@escola.exemplo", "admin@escola.exemplo"} {
		u := d.usuarios[email]
		if err := d.auditar(d.agora.Add(-time.Duration(d.rnd.IntN(180)+5)*time.Minute), &u, "login", "usuario", u.ID, ""); err != nil {
			return err
		}
	}
	return nil
}

func ordenarSemEntregaPorUltimo(alunos []alunoDemo, apelido string) []alunoDemo {
	out := slices.Clone(alunos)
	i := slices.IndexFunc(out, func(a alunoDemo) bool { return a.apelido == apelido })
	if i >= 0 {
		a := out[i]
		out = append(slices.Delete(out, i, i+1), a)
	}
	return out
}

func buscarAluno(apelido string) alunoDemo {
	i := slices.IndexFunc(alunosDemo, func(a alunoDemo) bool { return a.apelido == apelido })
	return alunosDemo[i]
}

// variacaoRecusada: o professor recusa mais as marcas de fala ("pra", "cê")
// em alguns perfis, o que gera o alerta de possível viés nas métricas.
func (d *demo) decidir(ap dominio.Apontamento, grupo string) dominio.Decisao {
	sensivel := grupo == "Rural" || grupo == "Quilombola"
	r := d.rnd.Float64()
	switch {
	case ap.Variacao && sensivel && r < 0.85, ap.Variacao && !sensivel && r < 0.2:
		return dominio.DecisaoRecusada
	case !ap.Variacao && sensivel && r < 0.3, !ap.Variacao && !sensivel && r < 0.06:
		return dominio.DecisaoRecusada
	case !ap.Variacao && r > 0.88:
		return dominio.DecisaoEditada
	default:
		return dominio.DecisaoAceita
	}
}

func (d *demo) montarTexto(frases []string) string {
	ordem := d.rnd.Perm(len(frases))[:6]
	partes := make([]string, len(ordem))
	for i, j := range ordem {
		partes[i] = frases[j]
	}
	return strings.Join(partes[:3], " ") + "\n\n" + strings.Join(partes[3:], " ")
}

// entre devolve um horário aleatório entre a e b (sem passar de agora menos 10 min).
func (d *demo) entre(a, b time.Time) time.Time {
	limite := d.agora.Add(-10 * time.Minute)
	if b.After(limite) {
		b = limite
	}
	if !b.After(a) {
		return a
	}
	return a.Add(time.Duration(d.rnd.Int64N(int64(b.Sub(a)))))
}

func (d *demo) criarRedacao(aluno alunoDemo, tema string, frases []string, situacao string, desde time.Time, propostaID *string) error {
	prof := d.professorDa(aluno.turma)
	doAluno := strings.HasSuffix(situacao, "-aluno")
	situacao = strings.TrimSuffix(situacao, "-aluno")
	criada := d.entre(desde.Add(2*time.Hour), d.agora.Add(-3*time.Hour))
	conteudo := d.montarTexto(frases)

	t := dominio.Texto{
		AlunoCodigo: aluno.apelido, Turma: aluno.turma, Grupo: aluno.grupo,
		Titulo: tema, Conteudo: conteudo, Versao: 1, Status: dominio.StatusPendente,
		Consentimento: true, CriadoPor: &prof.ID, CriadoEm: criada, AtualizadoEm: criada,
		PropostaID: propostaID, Origem: dominio.OrigemProfessor,
	}
	if doAluno {
		t.CriadoPor, t.Origem = nil, dominio.OrigemAluno
	}
	if situacao == falhou {
		t.ErroCorrecao = "A IA está sobrecarregada no momento. Aguarde um minuto e tente de novo."
	}

	var avaliado, enviado time.Time
	if situacao != pendente && situacao != falhou {
		res, err := corretor.Executar(d.ctx, corretor.Simulado{}, conteudo, d.cfg.Criterios)
		if err != nil {
			return err
		}
		avaliado = d.entre(criada.Add(5*time.Minute), criada.Add(3*time.Hour))
		enviado = d.entre(avaliado.Add(time.Hour), avaliado.Add(48*time.Hour))
		t.Status, t.Motor, t.CriteriosUsados = dominio.StatusRevisao, res.Motor, res.Criterios
		t.ComentarioIA, t.ComentarioProfessor, t.Descartados = res.Comentario, res.Comentario, res.Descartados
		t.AvaliadoEm, t.AtualizadoEm = &avaliado, avaliado

		quantas := map[string]int{nova: 0, parcial: len(res.Apontamentos) / 2, quase: len(res.Apontamentos) - 1, devolvida: len(res.Apontamentos)}[situacao]
		for i := range res.Apontamentos {
			if i >= quantas {
				break
			}
			ap := &res.Apontamentos[i]
			decisao := d.decidir(*ap, aluno.grupo)
			quando := d.entre(avaliado, enviado)
			ap.Decisao, ap.DecididoPor, ap.DecididoEm = &decisao, &prof.ID, &quando
			if decisao == dominio.DecisaoEditada {
				final := ap.Sugestao
				ap.SugestaoFinal = &final
			}
		}
		t.Apontamentos = res.Apontamentos
		if situacao == devolvida {
			comentario := comentariosProfessor[d.rnd.IntN(len(comentariosProfessor))]
			t.Status, t.ComentarioProfessor = dominio.StatusConcluido, comentario
			t.EnviadoEm, t.EnviadoPor, t.AtualizadoEm = &enviado, &prof.ID, enviado
		}
	}

	t, err := d.st.CriarTexto(d.ctx, t)
	if err != nil {
		return err
	}
	d.contagem[situacao]++
	if doAluno {
		d.contagem["enviadas pelo aluno"]++
		if err := d.auditar(criada, nil, "entrega_aluno", "texto", t.ID, "proposta="+*propostaID); err != nil {
			return err
		}
	} else if err := d.auditar(criada, &prof, "criar_texto", "texto", t.ID, "versao=1 origem=docx"); err != nil {
		return err
	}
	if t.AvaliadoEm != nil {
		if err := d.auditar(avaliado, &prof, "corrigir", "texto", t.ID, fmt.Sprintf("motor=simulado apontamentos=%d", len(t.Apontamentos))); err != nil {
			return err
		}
	}
	if t.EnviadoEm != nil {
		return d.auditar(enviado, &prof, "enviar_devolutiva", "texto", t.ID, "")
	}
	return nil
}

// gerarCodigos dá código de acesso a todos os alunos (os DEMO-000x são conhecidos).
func (d *demo) gerarCodigos() error {
	codigos := map[string]string{}
	for i, a := range alunosDemo {
		codigo, ok := codigosDemo[a.apelido]
		if !ok {
			var err error
			if codigo, err = auth.GerarCodigoAcesso(); err != nil {
				return err
			}
		}
		prof := d.professorDa(a.turma)
		d.relogio(d.em(10, 14, i))
		c := dominio.CodigoAcesso{AlunoCodigo: a.apelido, Turma: a.turma, Grupo: a.grupo}
		if _, err := d.st.GravarCodigo(d.ctx, c, auth.HashCodigo(codigo), &prof.ID); err != nil {
			return err
		}
		codigos[a.apelido] = codigo
	}
	d.codigos = codigos
	for _, email := range []string{"professor@escola.exemplo", "joao@escola.exemplo"} {
		u := d.usuarios[email]
		if err := d.auditar(d.em(10, 14, 45), &u, "gerar_codigos", "codigo", "", "alunos=10"); err != nil {
			return err
		}
	}
	return nil
}

func (d *demo) resumo(pasta string) error {
	// Lista de chamada fictícia, para importar na tela de Alunos.
	nomes := map[string]string{}
	for _, a := range alunosDemo {
		nomes[a.apelido] = a.nome
	}
	lista, _ := json.MarshalIndent(map[string]any{"tipo": "corretor-chamada", "versao": 1, "alunos": nomes}, "", "  ")
	arqLista := filepath.Join(pasta, "lista-de-chamada-demo.json")
	if err := os.WriteFile(arqLista, lista, 0o640); err != nil {
		return err
	}

	// Todos os códigos, para quem quiser testar outros alunos.
	arqCodigos := filepath.Join(pasta, "codigos-demo.csv")
	f, err := os.Create(arqCodigos)
	if err != nil {
		return err
	}
	w := csv.NewWriter(f)
	_ = w.Write([]string{"apelido", "turma", "nome_ficticio", "codigo"})
	for _, a := range alunosDemo {
		_ = w.Write([]string{a.apelido, a.turma, a.nome, d.codigos[a.apelido]})
	}
	w.Flush()
	if err := f.Close(); err != nil {
		return err
	}

	fmt.Println("Base de demonstração criada (conteúdo fictício).")
	fmt.Printf("  Propostas: %d · alunos: %d\n", d.contagem["propostas"], len(alunosDemo))
	fmt.Printf("  Redações: %d devolvidas, %d em revisão, %d aguardando a IA (%d com falha), %d enviadas pelo aluno\n",
		d.contagem[devolvida], d.contagem[nova]+d.contagem[parcial]+d.contagem[quase], d.contagem[pendente]+d.contagem[falhou],
		d.contagem[falhou], d.contagem["enviadas pelo aluno"])
	fmt.Println("\nContas (e-mail / senha):")
	for _, u := range usuariosDemo {
		situacao := ""
		if !u.ativo {
			situacao = " (desativada)"
		}
		fmt.Printf("  %-9s %-26s %s%s\n", u.perfil, u.email, u.senha, situacao)
	}
	fmt.Println("\nÁrea do aluno (/aluno):")
	for apelido, codigo := range map[string]string{"Jequitibá Coral": codigosDemo["Jequitibá Coral"], "Preguiça Oliva": codigosDemo["Preguiça Oliva"], "Ipê Lilás": codigosDemo["Ipê Lilás"]} {
		fmt.Printf("  %s  %s\n", codigo, apelido)
	}
	fmt.Printf("\nLista de chamada fictícia: %s (importe em Alunos › Importar cópia)\n", arqLista)
	fmt.Printf("Todos os códigos: %s\n", arqCodigos)
	return nil
}
