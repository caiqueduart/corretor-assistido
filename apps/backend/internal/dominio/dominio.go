// Package dominio define as entidades do Corretor Textual 3.000 (POC 1.3).
package dominio

import "time"

// Perfil de acesso de um usuário.
type Perfil string

const (
	PerfilAdmin     Perfil = "admin"     // define critérios, perfis sociolinguísticos e usuários
	PerfilProfessor Perfil = "professor" // importa, corrige, revisa e envia devolutivas
	PerfilLeitura   Perfil = "leitura"   // só visualiza textos e métricas
)

func (p Perfil) Valido() bool {
	return p == PerfilAdmin || p == PerfilProfessor || p == PerfilLeitura
}

// PodeEscrever indica se o perfil pode alterar textos.
func (p Perfil) PodeEscrever() bool { return p == PerfilAdmin || p == PerfilProfessor }

// Status do ciclo de vida de um texto.
type Status string

const (
	StatusPendente   Status = "pendente"   // importado, ainda sem correção
	StatusCorrigindo Status = "corrigindo" // correção em andamento
	StatusRevisao    Status = "revisao"    // corrigido, aguardando decisões do professor
	StatusConcluido  Status = "concluido"  // devolutiva validada e enviada
)

func (s Status) Valido() bool {
	switch s {
	case StatusPendente, StatusCorrigindo, StatusRevisao, StatusConcluido:
		return true
	}
	return false
}

// Decisão do professor sobre um apontamento.
type Decisao string

const (
	DecisaoAceita   Decisao = "aceita"
	DecisaoRecusada Decisao = "recusada"
	DecisaoEditada  Decisao = "editada"
)

func (d Decisao) Valida() bool {
	return d == DecisaoAceita || d == DecisaoRecusada || d == DecisaoEditada
}

// Motores de correção.
const (
	MotorIA       = "ia"
	MotorSimulado = "simulado"
)

// GrupoNaoInformado é o perfil sociolinguístico padrão e não pode ser removido.
const GrupoNaoInformado = "Não informado"

type Usuario struct {
	ID       string    `json:"id"`
	Nome     string    `json:"nome"`
	Email    string    `json:"email"`
	Perfil   Perfil    `json:"perfil"`
	Ativo    bool      `json:"ativo"`
	CriadoEm time.Time `json:"criado_em"`
}

type Texto struct {
	ID                  string        `json:"id"`
	AlunoCodigo         string        `json:"aluno_codigo"`
	Turma               string        `json:"turma"`
	Grupo               string        `json:"grupo"`
	Titulo              string        `json:"titulo"`
	Versao              int           `json:"versao"`
	OrigemID            *string       `json:"origem_id"`
	Conteudo            string        `json:"conteudo"`
	Status              Status        `json:"status"`
	Consentimento       bool          `json:"consentimento"`
	Exemplo             bool          `json:"exemplo"`
	Motor               string        `json:"motor"`
	CriteriosUsados     []string      `json:"criterios_usados"`
	ComentarioIA        string        `json:"comentario_ia"`
	ComentarioProfessor string        `json:"comentario_professor"`
	Descartados         int           `json:"descartados"`
	ErroCorrecao        string        `json:"erro_correcao"`
	CriadoPor           *string       `json:"criado_por"`
	CriadoEm            time.Time     `json:"criado_em"`
	AtualizadoEm        time.Time     `json:"atualizado_em"`
	AvaliadoEm          *time.Time    `json:"avaliado_em"`
	EnviadoEm           *time.Time    `json:"enviado_em"`
	EnviadoPor          *string       `json:"enviado_por"`
	Apontamentos        []Apontamento `json:"apontamentos,omitempty"`

	// Calculados na leitura.
	Palavras         int `json:"palavras"`
	TotalApontamento int `json:"total_apontamentos"`
	Pendentes        int `json:"pendentes"`
}

// Apontamento é um desvio indicado pela correção.
// Inicio e Fim são posições em unidades UTF-16 no conteúdo do texto,
// compatíveis com String.prototype.slice no navegador.
type Apontamento struct {
	ID            string     `json:"id"`
	TextoID       string     `json:"texto_id"`
	Ordem         int        `json:"ordem"`
	Criterio      string     `json:"criterio"`
	Trecho        string     `json:"trecho"`
	Inicio        int        `json:"inicio"`
	Fim           int        `json:"fim"`
	Sugestao      string     `json:"sugestao"`
	Explicacao    string     `json:"explicacao"`
	Variacao      bool       `json:"variacao"`
	Decisao       *Decisao   `json:"decisao"`
	SugestaoFinal *string    `json:"sugestao_final"`
	DecididoPor   *string    `json:"decidido_por"`
	DecididoEm    *time.Time `json:"decidido_em"`
}

// Correcao devolve o texto que substitui o trecho, considerando a decisão.
func (a Apontamento) Correcao() string {
	if a.Decisao != nil && *a.Decisao == DecisaoEditada && a.SugestaoFinal != nil {
		return *a.SugestaoFinal
	}
	return a.Sugestao
}

// Validado indica se o apontamento chega ao estudante.
func (a Apontamento) Validado() bool {
	return a.Decisao != nil && (*a.Decisao == DecisaoAceita || *a.Decisao == DecisaoEditada)
}

type Configuracao struct {
	Criterios     []string  `json:"criterios"`
	Grupos        []string  `json:"grupos"`
	LimiarVies    int       `json:"limiar_vies"`
	AtualizadoEm  time.Time `json:"atualizado_em"`
	AtualizadoPor *string   `json:"atualizado_por"`
}

// Criterio disponível para a correção.
type Criterio struct {
	ID        string `json:"id"`
	Descricao string `json:"descricao"`
}

// CriteriosDisponiveis lista os critérios que a correção sabe aplicar.
// A especificação da POC define Ortografia e Pontuação; os demais ficam
// disponíveis para teste.
var CriteriosDisponiveis = []Criterio{
	{"Ortografia", "Grafia das palavras, inclusive acentuação e hífen."},
	{"Pontuação", "Vírgula, ponto, ponto e vírgula, travessão, sinais de pergunta e exclamação."},
	{"Concordância", "Concordância verbal e nominal em relação à norma-padrão."},
	{"Maiúsculas", "Uso de letra maiúscula em início de frase e nomes próprios."},
}

// ConfiguracaoPadrao segue a especificação: ortografia e pontuação.
func ConfiguracaoPadrao() Configuracao {
	return Configuracao{
		Criterios:  []string{"Ortografia", "Pontuação"},
		Grupos:     []string{GrupoNaoInformado, "Urbano", "Rural", "Migrante de outra região", "Bilíngue / outra língua materna"},
		LimiarVies: 15,
	}
}

// RegistroAuditoria guarda quem fez o quê.
type RegistroAuditoria struct {
	ID         int64     `json:"id"`
	UsuarioID  *string   `json:"usuario_id"`
	Acao       string    `json:"acao"`
	Entidade   string    `json:"entidade"`
	EntidadeID string    `json:"entidade_id"`
	Detalhe    string    `json:"detalhe"`
	CriadoEm   time.Time `json:"criado_em"`
}
