import { HttpErrorResponse } from '@angular/common/http';

/** Corpo de erro padrão da API: `{"erro":{"codigo":"...","mensagem":"..."}}`. */
interface CorpoErroApi {
    readonly erro?: { readonly codigo?: string; readonly mensagem?: string };
}

const MENSAGEM_PADRAO = 'Ocorreu um erro inesperado. Tente de novo.';

/** Código do erro devolvido pela API, quando houver (ex.: `email_em_uso`). */
export function codigoDeErro(erro: unknown): string | null {
    if (erro instanceof HttpErrorResponse) {
        return (erro.error as CorpoErroApi | null)?.erro?.codigo ?? null;
    }

    return null;
}

/** Mensagem pronta para mostrar ao usuário a partir de qualquer erro de chamada. */
export function mensagemDeErro(erro: unknown, padrao = MENSAGEM_PADRAO): string {
    if (erro instanceof HttpErrorResponse) {
        const mensagem = (erro.error as CorpoErroApi | null)?.erro?.mensagem;

        if (mensagem) {
            return mensagem;
        }

        if (erro.status === 0) {
            return 'Não foi possível falar com o servidor. Confira sua conexão e tente de novo.';
        }

        return padrao;
    }

    return erro instanceof Error && erro.message ? erro.message : padrao;
}
