// Erros com código, para a tela reagir a cada caso sem depender do texto.
export type CodigoErro =
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'CREDENCIAIS'
  | 'BLOQUEADO'
  | 'VALIDACAO'
  | 'NAO_ENCONTRADO'
  | 'CONFLITO';

export class ApiError extends Error {
  readonly codigo: CodigoErro;
  constructor(codigo: CodigoErro, mensagem: string) {
    super(mensagem);
    this.name = 'ApiError';
    this.codigo = codigo;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Mensagem segura para mostrar ao usuário a partir de qualquer erro. */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  console.error(e);
  return 'Algo deu errado. Tente de novo.';
}
