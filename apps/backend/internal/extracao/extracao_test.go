package extracao

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestTXT(t *testing.T) {
	got, err := Extrair("redacao.TXT", []byte("\xEF\xBB\xBFMinha  cidade\r\n\r\n\r\n\r\nÉ pequena.  "))
	if err != nil || got != "Minha cidade\n\nÉ pequena." {
		t.Fatalf("got %q, %v", got, err)
	}
	// Windows-1252: "família" e aspas curvas.
	got, err = Extrair("antigo.txt", []byte("fam\xedlia \x93boa\x94"))
	if err != nil || got != "família “boa”" {
		t.Fatalf("cp1252: got %q, %v", got, err)
	}
}

func docx(t *testing.T, paragrafos ...string) []byte {
	t.Helper()
	var corpo strings.Builder
	for _, p := range paragrafos {
		// Cada parágrafo dividido em dois "runs", como o Word costuma salvar.
		meio := len(p) / 2
		for meio < len(p) && p[meio]&0xC0 == 0x80 {
			meio++
		}
		fmt.Fprintf(&corpo, `<w:p><w:r><w:t>%s</w:t></w:r><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, p[:meio], p[meio:])
	}
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	f, _ := z.Create("word/document.xml")
	fmt.Fprintf(f, `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s</w:body></w:document>`, corpo.String())
	z.Close()
	return buf.Bytes()
}

func TestDOCX(t *testing.T) {
	got, err := Extrair("texto.docx", docx(t, "Na roça onde eu moro a gente acorda cedo.", "", "Meu pai fala que vale a pena."))
	if err != nil {
		t.Fatal(err)
	}
	if got != "Na roça onde eu moro a gente acorda cedo.\n\nMeu pai fala que vale a pena." {
		t.Fatalf("got %q", got)
	}
	if _, err := Extrair("x.docx", []byte("não é zip")); !errors.Is(err, ErrCorrompido) {
		t.Fatalf("erro = %v", err)
	}
}

// pdfMinimo monta um PDF válido com uma linha de texto por item.
func pdfMinimo(linhas ...string) []byte {
	var cont strings.Builder
	cont.WriteString("BT /F1 12 Tf 72 720 Td 14 TL\n")
	for _, l := range linhas {
		fmt.Fprintf(&cont, "(%s) Tj T*\n", l)
	}
	cont.WriteString("ET")
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", cont.Len(), cont.String()),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offs := make([]int, len(objs))
	for i, o := range objs {
		offs[i] = b.Len()
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, o := range offs {
		fmt.Fprintf(&b, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xref)
	return b.Bytes()
}

func TestPDF(t *testing.T) {
	got, err := Extrair("redacao.pdf", pdfMinimo("Ontem eu fui no parque com a minha", "mae e o meu cachorro.", "Depois tomamos sorvete."))
	if err != nil {
		t.Fatal(err)
	}
	if got != "Ontem eu fui no parque com a minha mae e o meu cachorro.\nDepois tomamos sorvete." {
		t.Fatalf("got %q", got)
	}
	if _, err := Extrair("vazio.pdf", pdfMinimo()); !errors.Is(err, ErrSemTexto) {
		t.Fatalf("PDF sem texto: erro = %v", err)
	}
	if _, err := Extrair("ruim.pdf", []byte("%PDF-1.4 lixo")); !errors.Is(err, ErrCorrompido) {
		t.Fatalf("PDF corrompido: erro = %v", err)
	}
}

func TestLigaduras(t *testing.T) {
	if got := Normalizar("Especi\uFB01cação e re\uFB02exão"); got != "Especificação e reflexão" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatoNaoAceito(t *testing.T) {
	if _, err := Extrair("foto.jpg", []byte{1, 2}); !errors.Is(err, ErrFormato) {
		t.Fatalf("erro = %v", err)
	}
}

func TestJuntarLinhas(t *testing.T) {
	got := JuntarLinhas("primeira linha\nsegue aqui.\nNova frase\n\nOutro parágrafo")
	if got != "primeira linha segue aqui.\nNova frase\n\nOutro parágrafo" {
		t.Fatalf("got %q", got)
	}
}
