package auth

import (
	"crypto/rand"
	"math/big"
	"strings"
)

// Sem caracteres ambíguos (0/O, 1/I/L), fácil de ditar e digitar.
const alfabetoCodigo = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// GerarCodigoAcesso devolve um código aleatório de 8 caracteres no formato ABCD-EFGH.
func GerarCodigoAcesso() (string, error) {
	var b strings.Builder
	for i := 0; i < 8; i++ {
		if i == 4 {
			b.WriteByte('-')
		}
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alfabetoCodigo))))
		if err != nil {
			return "", err
		}
		b.WriteByte(alfabetoCodigo[n.Int64()])
	}
	return b.String(), nil
}

// NormalizarCodigo ignora hífens, espaços e maiúsculas/minúsculas.
func NormalizarCodigo(codigo string) string {
	return strings.Map(func(r rune) rune {
		if r == '-' || r == ' ' {
			return -1
		}
		return r
	}, strings.ToUpper(strings.TrimSpace(codigo)))
}

// HashCodigo é o que fica no banco: o código em si nunca é guardado.
func HashCodigo(codigo string) string {
	return HashToken("codigo:" + NormalizarCodigo(codigo))
}
