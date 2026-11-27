package main

// Conteúdo fictício da demonstração. Os textos têm desvios que o motor simulado
// reconhece (ortografia, pontuação e marcas de variação linguística, como "pra"
// e "cê"), para a revisão e as métricas terem o que mostrar.

type alunoDemo struct {
	apelido string
	turma   string
	grupo   string
	nome    string // só para a lista de chamada local (fictício)
}

var alunosDemo = []alunoDemo{
	// 8º A
	{"Ipê Lilás", "8º A", "Urbano", "Ana Clara Moreira"},
	{"Onça Jade", "8º A", "Rural", "Bruno Henrique Lima"},
	{"Capivara Anil", "8º A", "Urbano", "Carolina Duarte"},
	{"Sabiá Coral", "8º A", "Migrante de outra região", "Davi Albuquerque"},
	{"Jatobá Turquesa", "8º A", "Urbano", "Eduarda Nogueira"},
	{"Tucano Âmbar", "8º A", "Rural", "Felipe Aragão"},
	{"Bromélia Azul", "8º A", "Não informado", "Gabriela Prates"},
	{"Quati Verde", "8º A", "Urbano", "Heitor Campos"},
	{"Buriti Rosa", "8º A", "Bilíngue / outra língua materna", "Isabela Yamamoto"},
	{"Tatu Ocre", "8º A", "Rural", "João Pedro Siqueira"},
	// 8º B
	{"Arara Índigo", "8º B", "Rural", "Kauã Ferreira"},
	{"Pequi Marfim", "8º B", "Quilombola", "Larissa Conceição"},
	{"Boto Cinza", "8º B", "Urbano", "Matheus Rocha"},
	{"Açaí Vinho", "8º B", "Quilombola", "Nicole Santana"},
	{"Seriema Oliva", "8º B", "Rural", "Otávio Brandão"},
	{"Ingá Lilás", "8º B", "Urbano", "Pietra Monteiro"},
	{"Jabuti Coral", "8º B", "Migrante de outra região", "Rafael Ventura"},
	{"Cajueiro Jade", "8º B", "Rural", "Sofia Bezerra"},
	{"Garça Âmbar", "8º B", "Não informado", "Thiago Peixoto"},
	{"Angico Azul", "8º B", "Quilombola", "Valentina Assis"},
	// 9º A
	{"Mandacaru Bordô", "9º A", "Rural", "Arthur Pimentel"},
	{"Coruja Turquesa", "9º A", "Urbano", "Beatriz Fontes"},
	{"Samaúma Verde", "9º A", "Urbano", "Caio Mendonça"},
	{"Paca Rosa", "9º A", "Rural", "Daniela Freitas"},
	{"Juazeiro Anil", "9º A", "Migrante de outra região", "Enzo Cardoso"},
	{"Preguiça Oliva", "9º A", "Urbano", "Fernanda Lacerda"},
	{"Orquídea Cinza", "9º A", "Bilíngue / outra língua materna", "Gustavo Okada"},
	{"Cutia Índigo", "9º A", "Rural", "Helena Vasconcelos"},
	{"Jequitibá Coral", "9º A", "Urbano", "Igor Tavares"},
	{"Uirapuru Jade", "9º A", "Quilombola", "Júlia Nascimento"},
}

type propostaDemo struct {
	tema      string
	genero    string
	enunciado string
	turmas    []string
	prazoDias int // em relação a hoje
	encerrada bool
	criadaHa  int // dias atrás
	frases    []string
}

var propostasDemo = []propostaDemo{
	{
		tema:      "Os desafios da mobilidade no campo e na cidade",
		genero:    "Dissertativo-argumentativo",
		enunciado: "Com base nos textos lidos em sala, escreva um texto dissertativo-argumentativo sobre os desafios de se deslocar no campo e na cidade. Apresente ao menos dois argumentos e uma proposta de solução.",
		turmas:    []string{"9º A"},
		prazoDias: 2, criadaHa: 9,
		frases: []string{
			"Todo dia eu pego o onibus antes das seis horas pra chegar na escola.",
			"Na minha opinião o transporte público precisa melhorar muito.",
			"O caminho é longo e as vezes o onibus nem passa quando chove.",
			"Muita gente ja desistiu de estudar por causa da distância.",
			"A cidade tem mais opções de transporte, mais tem trânsito o dia inteiro.",
			"Tambem faltam ciclovias seguras para quem vai de bicicleta.",
			"Derrepente a estrada fica cheia de lama e ninguem consegue passar.",
			"O governo deveria investir em estradas e em mais horários de onibus.",
			"Cê imagina acordar cinco horas pra estudar e ainda chegar atrasado.",
			"Uma solução seria criar linhas especiais para os estudantes da zona rural.",
			"Porem, é difícil resolver isso sem ouvir quem mora longe da escola.",
			"Alem disso, o preço da passagem pesa no orçamento das familias.",
		},
	},
	{
		tema:      "Uma memória da minha família",
		genero:    "Relato",
		enunciado: "Converse com alguém da sua família e relate uma memória marcante dessa pessoa. Conte onde aconteceu, quem estava lá e por que essa história é importante para vocês.",
		turmas:    []string{"8º A", "8º B"},
		prazoDias: 12, criadaHa: 5,
		frases: []string{
			"Minha avó contou uma historia que eu nunca vou esquecer.",
			"Ela morava num sítio e ia pra escola a pé todo sabado de manhã.",
			"No caminho tinha um rio e as vezes a ponte caía com a chuva.",
			"Ela disse que ja carregou os irmãos nas costas pra atravessar.",
			"Foi um dia inesquecivel quando o pai dela comprou o primeiro rádio.",
			"Todo mundo da familia se juntava pra ouvir as noticias e as músicas.",
			"Tambem tinha festa junina com fogueira, quentão e quadrilha.",
			"Cê acredita que ela aprendeu a ler sozinha com um jornal velho?",
			"Ninguem na casa sabia ler, porem ela não desistiu.",
			"Hoje ela fala que estudar foi a coisa mais dificil e mais bonita da vida dela.",
			"Eu fiquei orgulhoso de ouvir essa historia da minha familia.",
			"Depois da conversa eu entendi por que ela gosta tanto de livros.",
		},
	},
	{
		tema:      "O celular na escola: aliado ou distração?",
		genero:    "Artigo de opinião",
		enunciado: "A escola discute uma regra para o uso do celular em sala. Escreva um artigo de opinião defendendo o seu ponto de vista, com argumentos e exemplos.",
		turmas:    []string{"9º A"},
		prazoDias: -3, criadaHa: 16,
		frases: []string{
			"Na minha opinião o celular pode ajudar muito nas aulas.",
			"Ele é rapido para pesquisar uma palavra ou uma noticia.",
			"Mais tem gente que fica só nas redes sociais e não presta atenção.",
			"O ultimo trabalho de matematica eu fiz com um aplicativo de gráficos.",
			"Tambem dá pra gravar a explicação e estudar depois em casa.",
			"Porem, a escola precisa combinar regras claras com os alunos.",
			"Alguem sempre vai usar o celular errado, com ou sem proibição.",
			"Proibir tudo é mais dificil do que ensinar a usar direito.",
			"Cê já viu como a turma fica animada quando a aula usa tecnologia?",
			"Alem de pesquisar, dá pra treinar portugues com jogos de palavras.",
			"Por isso eu defendo o uso do celular com combinados na escola mas com limites.",
			"O importante é que o celular seja uma ferramenta e não uma distração.",
		},
	},
	{
		tema:      "Carta ao prefeito sobre o nosso bairro",
		genero:    "Carta argumentativa",
		enunciado: "Escreva uma carta ao prefeito apresentando um problema do seu bairro e propondo uma solução. Use argumentos e seja respeitoso.",
		turmas:    []string{"8º A", "8º B"},
		prazoDias: -20, encerrada: true, criadaHa: 26,
		frases: []string{
			"Senhor prefeito, escrevo pra falar sobre a praça do meu bairro.",
			"A praça ja foi um lugar bonito, mais tem lixo em todo canto agora.",
			"As crianças não têm onde brincar e as familias ficam em casa.",
			"Tambem falta iluminação e ninguem se sente seguro à noite.",
			"Derrepente uma lâmpada queima e demora meses pra trocar.",
			"Na minha opinião o bairro merece mais atenção da prefeitura.",
			"Peço que a praça seja limpa todo sabado e que coloquem mais lixeiras.",
			"Alem disso, seria bom ter uma quadra pra jogar bola.",
			"Cê pode contar com os moradores pra cuidar do espaço.",
			"Porem, sem a ajuda da prefeitura é muito dificil mudar.",
			"Agradeço a atenção e espero uma resposta rapido.",
			"Atenciosamente, um morador que gosta muito do bairro.",
		},
	},
	{
		tema:      "A festa da minha comunidade",
		genero:    "Narrativo",
		enunciado: "Narre uma festa ou celebração da sua comunidade, com personagens, lugar e um acontecimento inesperado.",
		turmas:    []string{"8º B"},
		prazoDias: 20, criadaHa: 1,
	},
}

// Redações avulsas (sem proposta).
var frasesAvulsas = []string{
	"No fim de semana as minhas primas vieram de longe pra visitar a gente.",
	"Fomos ao rio e ja na chegada começou a chover forte.",
	"Tambem levamos bolo de milho e suco de caju.",
	"Derrepente apareceu um barco com pescadores cantando.",
	"Foi um dia inesquecivel pra toda a familia.",
	"Na minha opinião o melhor foi o almoço debaixo da mangueira.",
	"Porem, a volta de onibus foi demorada e cansativa.",
	"Cê não imagina o tanto de peixe que eles pescaram.",
}

var comentariosProfessor = []string{
	"Muito bem! Suas ideias estão claras. Revise os acentos indicados na reescrita.",
	"Ótimo relato, com detalhes que prendem a leitura. Atenção à pontuação.",
	"Bons argumentos! Na reescrita, cuide dos acentos e da vírgula antes de “mas”.",
	"Gostei muito da sua proposta de solução. Continue assim!",
	"Seu texto está bem organizado. Revise as palavras marcadas.",
	"Texto envolvente! As marcas da fala combinam com o relato; mantenha onde fizer sentido.",
}
