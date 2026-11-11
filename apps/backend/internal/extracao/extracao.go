// Package extracao lê o texto de arquivos PDF, DOCX e TXT.
package extracao

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
)

var (
	ErrFormato    = errors.New("formato não aceito: use PDF, TXT ou DOCX")
	ErrSemTexto   = errors.New("o arquivo não tem texto legível")
	ErrCorrompido = errors.New("não foi possível ler o arquivo")
)

// Extrair devolve o texto do arquivo, decidido pela extensão do nome.
func Extrair(nome string, dados []byte) (texto string, err error) {
	switch strings.ToLower(filepath.Ext(nome)) {
	case ".txt":
		texto = lerTXT(dados)
	case ".docx":
		texto, err = lerDOCX(dados)
	case ".pdf":
		texto, err = lerPDF(dados)
		if err == nil && strings.TrimSpace(texto) == "" {
			return "", fmt.Errorf("%w: o PDF parece ser uma imagem digitalizada, que precisa de reconhecimento de texto (OCR)", ErrSemTexto)
		}
	default:
		return "", ErrFormato
	}
	if err != nil {
		return "", err
	}
	texto = Normalizar(texto)
	if texto == "" {
		return "", ErrSemTexto
	}
	return texto, nil
}

var (
	reEspacos   = regexp.MustCompile(`[ \t\x{00A0}]+`)
	reFimLinha  = regexp.MustCompile(` *\n *`)
	reMuitasLin = regexp.MustCompile(`\n{3,}`)
)

// ligaduras tipográficas comuns em PDF (ex.: "Especiﬁcação").
var ligaduras = strings.NewReplacer("\uFB00", "ff", "\uFB01", "fi", "\uFB02", "fl", "\uFB03", "ffi", "\uFB04", "ffl", "\u00AD", "")

// Normalizar padroniza quebras de linha, espaços e ligaduras.
func Normalizar(s string) string {
	s = strings.TrimPrefix(s, "\uFEFF")
	s = ligaduras.Replace(s)
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = reEspacos.ReplaceAllString(s, " ")
	s = reFimLinha.ReplaceAllString(s, "\n")
	s = reMuitasLin.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}

// lerTXT aceita UTF-8 e, como alternativa, Windows-1252 (comum em arquivos
// salvos no Bloco de Notas antigo).
func lerTXT(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	var sb strings.Builder
	for _, c := range b {
		if c >= 0x80 && c <= 0x9F {
			if r, ok := cp1252[c]; ok {
				sb.WriteRune(r)
				continue
			}
		}
		sb.WriteRune(rune(c))
	}
	return sb.String()
}

var cp1252 = map[byte]rune{
	0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
	0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
	0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ',
}

// lerDOCX lê word/document.xml: cada parágrafo vira uma linha separada por linha em branco.
func lerDOCX(b []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return "", fmt.Errorf("%w: o DOCX está corrompido", ErrCorrompido)
	}
	var doc *zip.File
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			doc = f
			break
		}
	}
	if doc == nil {
		return "", fmt.Errorf("%w: o arquivo não é um documento do Word", ErrCorrompido)
	}
	if doc.UncompressedSize64 > 50<<20 {
		return "", fmt.Errorf("%w: documento grande demais", ErrCorrompido)
	}
	rc, err := doc.Open()
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrCorrompido, err)
	}
	defer rc.Close()
	dec := xml.NewDecoder(io.LimitReader(rc, 50<<20))
	var sb strings.Builder
	emTexto := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("%w: %v", ErrCorrompido, err)
		}
		switch el := tok.(type) {
		case xml.StartElement:
			switch el.Name.Local {
			case "t":
				emTexto = true
			case "tab":
				sb.WriteString(" ")
			case "br", "cr":
				sb.WriteString("\n")
			}
		case xml.EndElement:
			switch el.Name.Local {
			case "t":
				emTexto = false
			case "p":
				sb.WriteString("\n\n")
			}
		case xml.CharData:
			if emTexto {
				sb.Write(el)
			}
		}
	}
	return sb.String(), nil
}

// lerPDF extrai o texto de PDFs com texto selecionável.
func lerPDF(b []byte) (texto string, err error) {
	defer func() {
		// A biblioteca de PDF entra em pânico com alguns arquivos malformados.
		if r := recover(); r != nil {
			texto, err = "", fmt.Errorf("%w: o PDF está corrompido ou protegido", ErrCorrompido)
		}
	}()
	r, err := pdf.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return "", fmt.Errorf("%w: o PDF está corrompido ou protegido", ErrCorrompido)
	}
	var sb strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		txt, err := p.GetPlainText(nil)
		if err != nil {
			return "", fmt.Errorf("%w: %v", ErrCorrompido, err)
		}
		sb.WriteString(txt)
		sb.WriteString("\n\n")
	}
	return JuntarLinhas(sb.String()), nil
}

// JuntarLinhas une linhas quebradas no meio de uma frase (comum em PDF).
// Uma linha que termina em . ! ? : ; mantém a quebra; linha em branco separa parágrafos.
func JuntarLinhas(s string) string {
	linhas := strings.Split(strings.ReplaceAll(s, "\r", ""), "\n")
	var sb strings.Builder
	for i, l := range linhas {
		l = strings.TrimSpace(l)
		sb.WriteString(l)
		if i == len(linhas)-1 {
			break
		}
		prox := strings.TrimSpace(linhas[i+1])
		switch {
		case l == "" || prox == "":
			sb.WriteString("\n")
		case strings.ContainsAny(l[len(l)-1:], ".!?:;"):
			sb.WriteString("\n")
		default:
			sb.WriteString(" ")
		}
	}
	return sb.String()
}
