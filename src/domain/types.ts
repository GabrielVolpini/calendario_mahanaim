// =====================================================================
// TIPOS DO DOMÍNIO
// Descrevem o formato dos dados em todo o app. Na fase de banco, as
// tabelas devem refletir estes tipos (ou estes tipos passam a ser gerados
// a partir do banco).
// =====================================================================

export const CATEGORIAS = ['feriado', 'evento', 'aniv', 'data', 'culto'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const PERFIS = ['admin', 'user'] as const;
export type Perfil = (typeof PERFIS)[number];

export const STATUS_SOLICITACAO = ['pendente', 'aprovada', 'recusada'] as const;
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number];

export const CORES_CAMPANHA = ['azul', 'rosa', 'amarelo', 'verde'] as const;
export type CorCampanha = (typeof CORES_CAMPANHA)[number];

/** 'um' = somente este dia · 'proximos' = este e os próximos da série */
export const ESCOPOS = ['um', 'proximos'] as const;
export type Escopo = (typeof ESCOPOS)[number];

/** Data no formato AAAA-MM-DD */
export type DataIso = string;
/** Ano e mês no formato AAAA-MM */
export type AnoMes = string;

/** Campos de um evento que alguém pode preencher. */
export interface EventoDados {
  data: DataIso;
  /** categoria */
  c: Categoria;
  /** título */
  n: string;
  /** horário, ex.: "10h" ou "18h30" */
  t?: string | undefined;
  /** local ou observação */
  l?: string | undefined;
  /** data final, para eventos de vários dias */
  fim?: DataIso | undefined;
}

export interface Evento extends EventoDados {
  id: string;
  /** eventos recorrentes compartilham a mesma série */
  serie?: string | undefined;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  /** true até a pessoa trocar a senha provisória no primeiro acesso (a senha em si nunca é guardada). */
  senhaProvisoria: boolean;
}

export interface Solicitacao {
  id: string;
  status: StatusSolicitacao;
  autorId: string;
  /** data e hora ISO */
  criadoEm: string;
  evento: EventoDados;
  mensagem?: string | undefined;
  motivo?: string | undefined;
  revisadoPor?: string | undefined;
  revisadoEm?: string | undefined;
  eventoId?: string | undefined;
}

/** Solicitação como a tela recebe (com os nomes já resolvidos). */
export interface SolicitacaoView extends Solicitacao {
  autorNome: string;
  revisorNome?: string | undefined;
}

export interface Campanha {
  /** nome */
  n: string;
  /** descrição */
  s: string;
  c: CorCampanha;
}

export type Campanhas = Record<AnoMes, Campanha>;
