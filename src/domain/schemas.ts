// =====================================================================
// VALIDAÇÕES (Zod)
// O TypeScript só confere o código na hora de compilar. Estes esquemas
// conferem os DADOS enquanto o app roda: tudo o que vem de formulário,
// do armazenamento ou (no futuro) da rede passa por aqui antes de ser usado.
// Os mesmos esquemas podem ser reaproveitados no servidor.
// =====================================================================
import { z } from 'zod';
import { CATEGORIAS, CORES_CAMPANHA, ESCOPOS, ESPACOS, ESPACOS_DA_UNIDADE, PERFIS, UNIDADES } from './types';

// ---------- blocos básicos ----------

/** Bloqueia caracteres de controle e os sinais < > (defesa contra injeção de HTML). */
const SEGURO = /^[^\u0000-\u001F\u007F<>]*$/;
const MSG_INSEGURO = 'Não use os caracteres < > nem caracteres especiais invisíveis.';

/** Texto obrigatório, sem espaços nas pontas, com limite de tamanho. */
const texto = (campo: string, max: number) =>
  z
    .string({ error: `Informe ${campo}.` })
    .trim()
    .min(1, `Informe ${campo}.`)
    .max(max, `${capitalizar(campo)}: máximo de ${max} caracteres.`)
    .regex(SEGURO, MSG_INSEGURO);

/** Converte "" (campo vazio de formulário) em ausente. */
const vazioViraAusente = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Texto opcional: aceita vazio, mas se vier preenchido segue as mesmas regras. */
const textoOpcional = (campo: string, max: number) =>
  z.preprocess(vazioViraAusente, texto(campo, max).optional());

const ANO_MIN = 2020, ANO_MAX = 2100;
export const dataIso = z.iso
  .date({ error: 'Informe uma data válida.' })
  .refine(d => {
    const ano = Number(d.slice(0, 4));
    return ano >= ANO_MIN && ano <= ANO_MAX;
  }, `A data precisa estar entre ${ANO_MIN} e ${ANO_MAX}.`);

/** Horário no padrão da igreja: "10h", "9h", "18h30". */
export const horario = z
  .string()
  .regex(/^([01]?\d|2[0-3])h([0-5]\d)?$/, 'Horário inválido.');

export const anoMes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');

export const email = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .max(120, 'E-mail muito longo.')
  .pipe(z.email('Informe um e-mail válido.'));

/** Senha: 8 a 72 caracteres, com pelo menos uma letra e um número. */
export const senhaNova = z
  .string()
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha precisa ter ao menos uma letra.')
  .regex(/\d/, 'A senha precisa ter ao menos um número.');

/** Identificador: UUID (banco) ou o formato curto do protótipo (ex.: e12). */
export const id = z.string().regex(/^([a-z]\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, 'Identificador inválido.');

// ---------- entradas da API ----------
// strictObject: recusa campos extras (evita que alguém "injete", por exemplo,
// um campo serie, id ou status que não deveria poder definir).

export const EventoInput = z
  .strictObject({
    n: texto('o título', 80),
    c: z.enum(CATEGORIAS, { error: 'Escolha um tipo válido.' }),
    data: dataIso,
    t: z.preprocess(vazioViraAusente, horario.optional()),
    un: z.preprocess(vazioViraAusente, z.enum(UNIDADES, { error: 'Escolha um local válido.' }).optional()),
    esp: z.preprocess(vazioViraAusente, z.enum(ESPACOS, { error: 'Escolha um espaço válido.' }).optional()),
    l: textoOpcional('a observação', 80),
    fim: z.preprocess(vazioViraAusente, dataIso.optional()),
  })
  .refine(e => !e.esp || (!!e.un && ESPACOS_DA_UNIDADE[e.un].includes(e.esp)), {
    path: ['esp'],
    message: 'Esse espaço não existe no local escolhido.',
  })
  .refine(e => !e.fim || e.fim > e.data, {
    path: ['fim'],
    message: 'A data final precisa ser depois da data inicial.',
  })
  .refine(e => !e.fim || diasEntre(e.data, e.fim) <= 31, {
    path: ['fim'],
    message: 'Um evento pode durar no máximo 31 dias.',
  });
export type EventoInput = z.output<typeof EventoInput>;

export const EventoEdicao = z.strictObject({ id, dados: EventoInput, escopo: z.enum(ESCOPOS) });

export const LoginInput = z.strictObject({
  email,
  senha: z.string().min(1, 'Informe a senha.').max(72, 'Senha inválida.'),
  lembrar: z.boolean(),
});

export const SolicitacaoInput = z.strictObject({
  evento: EventoInput,
  mensagem: textoOpcional('a mensagem', 400),
});

export const MotivoInput = textoOpcional('o motivo', 300);

export const NovoUsuarioInput = z.strictObject({
  nome: texto('o nome', 60),
  email,
  senha: senhaNova,
  perfil: z.enum(PERFIS),
});
export type NovoUsuarioInput = z.input<typeof NovoUsuarioInput>;

export const AtualizarUsuarioInput = z.strictObject({
  id,
  perfil: z.enum(PERFIS).optional(),
  ativo: z.boolean().optional(),
});
export type AtualizarUsuarioInput = z.input<typeof AtualizarUsuarioInput>;

/** Troca da senha provisória no primeiro acesso: nova senha + confirmação. */
export const TrocaSenhaInput = z.strictObject({
  senha: senhaNova,
  confirmacao: z.string().max(72, 'Senha inválida.'),
}).refine(d => d.senha === d.confirmacao, { message: 'A confirmação não é igual à nova senha.', path: ['confirmacao'] });
export type TrocaSenhaInput = z.input<typeof TrocaSenhaInput>;

export const CampanhaInput = z.strictObject({
  n: texto('o nome da campanha', 40),
  s: z.preprocess(v => v ?? '', z.string().trim().max(80, 'Descrição: máximo de 80 caracteres.').regex(SEGURO, MSG_INSEGURO)),
  c: z.enum(CORES_CAMPANHA, { error: 'Escolha uma cor válida.' }),
});
export type CampanhaInput = z.input<typeof CampanhaInput>;

/** Texto longo com várias linhas (atas): só bloqueia caracteres de controle invisíveis.
 *  Aqui < > são permitidos porque a tela sempre exibe o texto escapado. */
const MULTILINHA = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const MSG_INVISIVEL = 'O texto tem caracteres especiais invisíveis. Apague-os e tente de novo.';
const textoLongo = (campo: string, max: number) =>
  z.preprocess(v => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n') : v ?? ''), z
    .string()
    .max(max, `${capitalizar(campo)}: máximo de ${max} caracteres.`)
    .regex(MULTILINHA, MSG_INVISIVEL)
    .transform(v => v.replace(/^\s*\n|\s+$/g, '')));
const textoLongoOpcional = (campo: string, max: number) =>
  z.preprocess(vazioViraAusente, textoLongo(campo, max).optional());

export const AtaInput = z.strictObject({
  titulo: texto('o título', 120),
  data: dataIso,
  participantes: textoLongoOpcional('a lista de participantes', 500),
  resumo: textoLongoOpcional('o resumo', 1000),
  conteudo: textoLongo('o texto da ata', 50000),
  fixada: z.boolean(),
  eventoId: z.preprocess(vazioViraAusente, id.optional()),
}).refine(a => a.conteudo.trim() || a.resumo, {
  path: ['conteudo'],
  message: 'Escreva o que foi discutido ou um resumo da reunião.',
});
export type AtaInput = z.input<typeof AtaInput>;

// ---------- utilidades ----------

function capitalizar(s: string): string {
  const semArtigo = s.replace(/^(o|a|os|as) /, '');
  return semArtigo.charAt(0).toUpperCase() + semArtigo.slice(1);
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
}

/** Primeira mensagem de erro, pronta para mostrar na tela. */
export function primeiraMensagem(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Dados inválidos.';
}
