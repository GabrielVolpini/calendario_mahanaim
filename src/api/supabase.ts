// =====================================================================
// API REAL — implementa o contrato (contract.ts) com o Supabase.
//
// Quem garante as regras é o BANCO: Row Level Security (só admin grava),
// funções solicitar/aprovar/recusar/cancelar e gatilhos. Aqui repetimos a
// validação com Zod para dar resposta rápida e mensagens claras na tela.
//
// Diferenças de formato entre o app e o banco ficam todas neste arquivo:
//   app  c (categoria)  ↔  banco tipo (tipos_evento.slug)
//   app  t "18h30"      ↔  banco hora_inicio '18:30:00'
//   app  l (local/obs.) ↔  banco local_id (se for um local cadastrado) ou observacao
//   app  serie          ↔  banco serie_id
// =====================================================================
import { createClient, type AuthError, type PostgrestError, type SupportedStorage } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CalendarApi } from './contract';
import type { Database } from './database.types';
import { ApiError } from './errors';
import { limpo, validar } from './comum';
import {
  AtualizarUsuarioInput, CampanhaInput, EventoInput, LoginInput, MotivoInput,
  NovoUsuarioInput, SolicitacaoInput, anoMes, id as idSchema,
} from '../domain/schemas';
import {
  CORES_CAMPANHA, ESCOPOS,
  type Campanhas, type Categoria, type CorCampanha, type Evento, type EventoDados,
  type Solicitacao, type SolicitacaoView, type StatusSolicitacao, type Usuario,
} from '../domain/types';

type Status = Database['public']['Enums']['status_evento'];
type EventoUpdate = Database['public']['Tables']['eventos']['Update'];

// ---------- "Lembrar de mim": sessão no localStorage (fica) ou no sessionStorage (some ao fechar) ----------
const LEMBRAR_KEY = 'mahanaim.lembrar';
type Area = 'localStorage' | 'sessionStorage';
const ler = (a: Area, k: string): string | null => { try { return window[a].getItem(k); } catch { return null; } };
const gravar = (a: Area, k: string, v: string): void => { try { window[a].setItem(k, v); } catch { /* sem armazenamento */ } };
const apagar = (a: Area, k: string): void => { try { window[a].removeItem(k); } catch { /* sem armazenamento */ } };
const lembrar = () => ler('localStorage', LEMBRAR_KEY) !== '0';

const armazenamentoSessao: SupportedStorage = {
  getItem: k => ler('localStorage', k) ?? ler('sessionStorage', k),
  setItem: (k, v) => {
    const [usar, limpar]: [Area, Area] = lembrar() ? ['localStorage', 'sessionStorage'] : ['sessionStorage', 'localStorage'];
    gravar(usar, k, v);
    apagar(limpar, k);
  },
  removeItem: k => { apagar('localStorage', k); apagar('sessionStorage', k); },
};

// ---------- conversões app ↔ banco ----------
const CATEGORIA_DO_TIPO: Record<string, Categoria> = {
  culto: 'culto', feriado: 'feriado', aniversario: 'aniv', data_comemorativa: 'data',
  // conferencia, reuniao, especial e tipos novos aparecem como "evento especial"
};
const categoria = (tipo: string): Categoria => CATEGORIA_DO_TIPO[tipo] ?? 'evento';

/** Tipo no banco para a categoria escolhida na tela. Mantém conferência/reunião ao editar. */
function tipoDoBanco(c: Categoria, tipoAtual?: string): string {
  switch (c) {
    case 'culto': return 'culto';
    case 'feriado': return 'feriado';
    case 'aniv': return 'aniversario';
    case 'data': return 'data_comemorativa';
    case 'evento': return tipoAtual && categoria(tipoAtual) === 'evento' ? tipoAtual : 'especial';
  }
}

/** '18:30:00' → '18h30' · '10:00:00' → '10h' */
function horaApp(h: string | null): string | undefined {
  if (!h) return undefined;
  const [hh = '0', mm = '00'] = h.split(':');
  return `${Number(hh)}h${mm === '00' ? '' : mm}`;
}
/** '18h30' → '18:30' · '10h' → '10:00' */
function horaBanco(t: string | undefined): string | null {
  const m = t ? /^(\d{1,2})h(\d{2})?$/.exec(t) : null;
  return m ? `${m[1]!.padStart(2, '0')}:${m[2] ?? '00'}` : null;
}

const STATUS_APP: Partial<Record<Status, StatusSolicitacao>> = { pendente: 'pendente', aprovado: 'aprovada', recusado: 'recusada' };
const corCampanha = (c: string): CorCampanha => ((CORES_CAMPANHA as readonly string[]).includes(c) ? (c as CorCampanha) : 'azul');
const opc = (v: string | null | undefined): string | undefined => v ?? undefined;

// ---------- erros do Supabase → ApiError (mensagem segura para a tela) ----------
function erroBanco(e: PostgrestError): ApiError {
  const msg = e.message ?? '';
  if (e.code === '42501' || /administradores/i.test(msg)) return new ApiError('SEM_PERMISSAO', 'Acesso restrito a administradores.');
  if (e.code === 'PGRST301' || /JWT|login/i.test(msg)) return new ApiError('NAO_AUTENTICADO', 'Sua sessão expirou. Entre novamente.');
  if (e.code === 'P0001') {
    // mensagens escritas por nós nas funções do banco: podem ir para a tela
    if (/não encontrad/i.test(msg)) return new ApiError('NAO_ENCONTRADO', msg);
    if (/pendentes|próprio acesso/i.test(msg)) return new ApiError('CONFLITO', msg);
    return new ApiError('VALIDACAO', msg);
  }
  if (e.code === '23505') return new ApiError('CONFLITO', 'Já existe um registro igual.');
  if (e.code?.startsWith('23')) return new ApiError('VALIDACAO', 'Dados inválidos para o banco.');
  console.error('Supabase:', e);
  return new ApiError('VALIDACAO', 'Não foi possível concluir. Tente de novo.');
}
function erroAuth(e: AuthError): ApiError {
  if (e.status === 429) return new ApiError('BLOQUEADO', 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  if (e.code === 'invalid_credentials' || e.status === 400) return new ApiError('CREDENCIAIS', 'E-mail ou senha incorretos.');
  if (e.code === 'user_banned') return new ApiError('SEM_PERMISSAO', 'Este acesso está desativado. Fale com a liderança.');
  console.error('Supabase Auth:', e);
  return new ApiError('NAO_AUTENTICADO', 'Não foi possível entrar agora. Tente de novo.');
}
type Resposta = { data: unknown; error: PostgrestError | null };
/** Desembrulha { data, error } do Supabase (data pode ser null: maybeSingle, update, delete). */
function ok<R extends Resposta>(r: R): R['data'] {
  if (r.error) throw erroBanco(r.error);
  return r.data;
}
/** Igual a ok(), mas exige que venha algum dado (listas, single, insert...select). */
function exigir<R extends Resposta>(r: R): NonNullable<R['data']> {
  const d = ok(r);
  if (d == null) throw new ApiError('NAO_ENCONTRADO', 'Registro não encontrado.');
  return d as NonNullable<R['data']>;
}

const COLUNAS_EVENTO = 'id, titulo, tipo, data_inicio, data_fim, hora_inicio, observacao, serie_id, local_id, locais(nome)' as const;
const PAGINA = 1000; // limite padrão de linhas por requisição no Supabase

export function createSupabaseApi(url: string, chave: string): CalendarApi {
  const sb = createClient<Database>(url, chave, {
    auth: { storage: armazenamentoSessao, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  // ---------- usuário atual ----------
  async function perfilAtual(): Promise<Usuario | null> {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('perfis').select('id, nome, email, perfil, ativo').eq('id', session.user.id).maybeSingle();
    if (error || !data) return null;
    if (!data.ativo) { await sb.auth.signOut(); return null; }
    return data;
  }
  async function exigirUsuario(): Promise<Usuario> {
    const u = await perfilAtual();
    if (!u) throw new ApiError('NAO_AUTENTICADO', 'Sua sessão expirou. Entre novamente.');
    return u;
  }

  // ---------- locais (cache: mudam raramente) ----------
  let locais: Promise<Map<string, string>> | null = null; // nome → id
  const mapaLocais = () => (locais ??= (async () =>
    new Map(exigir(await sb.from('locais').select('id, nome').eq('ativo', true)).map(l => [l.nome, l.id] as const)))());

  /** Converte os campos da tela para colunas do banco. */
  async function colunas(d: EventoDados, tipoAtual?: string): Promise<EventoUpdate> {
    const localId = d.l ? (await mapaLocais()).get(d.l) : undefined;
    return {
      titulo: d.n, tipo: tipoDoBanco(d.c, tipoAtual), data_inicio: d.data, data_fim: d.fim ?? null,
      hora_inicio: horaBanco(d.t), local_id: localId ?? null, observacao: localId ? null : (d.l ?? null),
    };
  }

  type LinhaEvento = {
    id: string; titulo: string; tipo: string; data_inicio: string; data_fim: string | null; hora_inicio: string | null;
    observacao: string | null; serie_id: string | null; locais: { nome: string } | null;
  };
  const paraEvento = (r: LinhaEvento): Evento => {
    const e: Evento = { id: r.id, data: r.data_inicio, c: categoria(r.tipo), n: r.titulo };
    const t = horaApp(r.hora_inicio), l = r.locais?.nome ?? opc(r.observacao);
    if (t) e.t = t;
    if (l) e.l = l;
    if (r.data_fim && r.data_fim !== r.data_inicio) e.fim = r.data_fim;
    if (r.serie_id) e.serie = r.serie_id;
    return e;
  };

  async function acharEvento(id: string) {
    const r = ok(await sb.from('eventos').select('id, tipo, data_inicio, serie_id').eq('id', id).maybeSingle());
    if (!r) throw new ApiError('NAO_ENCONTRADO', 'Evento não encontrado.');
    return r;
  }

  // ---------- solicitações ----------
  type LinhaFila = Database['public']['Views']['fila_solicitacoes']['Row'];
  const paraSolicitacao = (r: LinhaFila): SolicitacaoView | null => {
    const status = r.status ? STATUS_APP[r.status] : undefined;
    if (!status || !r.id || !r.titulo || !r.tipo || !r.data_inicio) return null; // canceladas somem da lista
    const evento: EventoDados = { data: r.data_inicio, c: categoria(r.tipo), n: r.titulo };
    const t = horaApp(r.hora_inicio), l = opc(r.local_nome) ?? opc(r.observacao);
    if (t) evento.t = t;
    if (l) evento.l = l;
    if (r.data_fim) evento.fim = r.data_fim;
    return {
      id: r.id, status, autorId: r.solicitante_id ?? '', criadoEm: r.criado_em ?? '', evento,
      mensagem: opc(r.mensagem), motivo: opc(r.motivo_recusa), revisadoPor: opc(r.revisado_por),
      revisadoEm: opc(r.revisado_em), eventoId: status === 'aprovada' ? opc(r.evento_id) : undefined,
      autorNome: r.solicitante_nome ?? '—', revisorNome: r.revisado_por ? (r.revisor_nome ?? 'Liderança') : undefined,
    };
  };
  async function solicitacao(id: string): Promise<Solicitacao> {
    const r = ok(await sb.from('fila_solicitacoes').select('*').eq('id', id).maybeSingle());
    const s = r && paraSolicitacao(r);
    if (!s) throw new ApiError('NAO_ENCONTRADO', 'Solicitação não encontrada.');
    return s;
  }

  // ---------- campanhas ----------
  async function campanhas(): Promise<Campanhas> {
    const linhas = exigir(await sb.from('campanhas').select('ano, mes, nome, descricao, cor'));
    const out: Campanhas = {};
    for (const c of linhas) out[`${c.ano}-${String(c.mes).padStart(2, '0')}`] = { n: c.nome, s: c.descricao ?? '', c: corCampanha(c.cor) };
    return out;
  }

  return {
    // -------- Autenticação --------
    async login(email, senha, lembrarMe) {
      const d = validar(LoginInput, { email, senha, lembrar: lembrarMe });
      gravar('localStorage', LEMBRAR_KEY, d.lembrar ? '1' : '0');
      const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.senha });
      if (error) throw erroAuth(error);
      const u = await perfilAtual();
      if (!u) {
        await sb.auth.signOut();
        throw new ApiError('SEM_PERMISSAO', 'Este acesso está desativado. Fale com a liderança.');
      }
      return u;
    },
    async logout() {
      await sb.auth.signOut();
      locais = null;
    },
    async me() { return perfilAtual(); },

    // -------- Eventos --------
    async listEvents() {
      await exigirUsuario();
      const todos: Evento[] = [];
      for (let de = 0; ; de += PAGINA) {
        const lote = exigir(await sb.from('eventos').select(COLUNAS_EVENTO)
          .eq('status', 'aprovado').order('data_inicio').order('id').range(de, de + PAGINA - 1));
        todos.push(...lote.map(paraEvento));
        if (lote.length < PAGINA) return todos;
      }
    },
    async createEvent(dados) {
      const u = await exigirUsuario();
      const d = limpo(validar(EventoInput, dados));
      const linha = { ...(await colunas(d)), titulo: d.n, tipo: tipoDoBanco(d.c), data_inicio: d.data, status: 'aprovado' as const, criado_por: u.id };
      return paraEvento(exigir(await sb.from('eventos').insert(linha).select(COLUNAS_EVENTO).single()));
    },
    async updateEvent(id, dados, escopo) {
      const u = await exigirUsuario();
      validar(idSchema, id);
      const esc = validar(z.enum(ESCOPOS), escopo);
      const d = limpo(validar(EventoInput, dados));
      const atual = await acharEvento(id);
      const novo = await colunas(d, atual.tipo);
      if (esc === 'proximos' && atual.serie_id) {
        // Na série, muda título, tipo, horário e local; as datas continuam as mesmas.
        const { titulo, tipo, hora_inicio, local_id, observacao } = novo;
        ok(await sb.from('eventos').update({ titulo, tipo, hora_inicio, local_id, observacao, atualizado_por: u.id })
          .eq('serie_id', atual.serie_id).gte('data_inicio', atual.data_inicio));
      } else {
        // "Somente este dia": vira exceção e sai da série
        ok(await sb.from('eventos').update({ ...novo, serie_id: null, atualizado_por: u.id }).eq('id', id));
      }
      return paraEvento(exigir(await sb.from('eventos').select(COLUNAS_EVENTO).eq('id', id).single()));
    },
    async deleteEvent(id, escopo) {
      await exigirUsuario();
      const esc = validar(z.enum(ESCOPOS), escopo);
      const atual = await acharEvento(validar(idSchema, id));
      const q = sb.from('eventos').delete();
      ok(await (esc === 'proximos' && atual.serie_id
        ? q.eq('serie_id', atual.serie_id).gte('data_inicio', atual.data_inicio)
        : q.eq('id', atual.id)));
    },

    // -------- Solicitações --------
    async listRequests() {
      await exigirUsuario(); // o RLS já filtra: user vê as próprias, admin vê todas
      const linhas = exigir(await sb.from('fila_solicitacoes').select('*').order('criado_em', { ascending: false }));
      return linhas.map(paraSolicitacao).filter((s): s is SolicitacaoView => s !== null);
    },
    async createRequest(evento, mensagem) {
      await exigirUsuario();
      const d = validar(SolicitacaoInput, { evento, mensagem });
      const e = limpo(d.evento);
      const c = await colunas(e);
      const id = exigir(await sb.rpc('solicitar_evento', {
        p_titulo: e.n, p_tipo: tipoDoBanco(e.c), p_data_inicio: e.data,
        ...(e.fim && { p_data_fim: e.fim }),
        ...(c.hora_inicio && { p_hora_inicio: c.hora_inicio }),
        ...(c.local_id && { p_local_id: c.local_id }),
        ...(c.observacao && { p_observacao: c.observacao }),
        ...(d.mensagem && { p_mensagem: d.mensagem }),
      }));
      return solicitacao(id);
    },
    async cancelRequest(id) {
      await exigirUsuario();
      ok(await sb.rpc('cancelar_solicitacao', { p_id: validar(idSchema, id) }));
    },
    async approveRequest(id, eventoAjustado) {
      const u = await exigirUsuario();
      validar(idSchema, id);
      if (eventoAjustado) {
        // "Ajustar e aprovar": corrige o evento pendente antes de aprovar
        const d = limpo(validar(EventoInput, eventoAjustado));
        const s = ok(await sb.from('solicitacoes').select('evento_id').eq('id', id).maybeSingle());
        if (!s) throw new ApiError('NAO_ENCONTRADO', 'Solicitação não encontrada ou já respondida.');
        ok(await sb.from('eventos').update({ ...(await colunas(d)), atualizado_por: u.id }).eq('id', s.evento_id).eq('status', 'pendente'));
      }
      ok(await sb.rpc('aprovar_solicitacao', { p_id: id }));
      return solicitacao(id);
    },
    async rejectRequest(id, motivo) {
      await exigirUsuario();
      const m = validar(MotivoInput, motivo);
      ok(await sb.rpc('recusar_solicitacao', { p_id: validar(idSchema, id), ...(m && { p_motivo: m }) }));
      return solicitacao(id);
    },

    // -------- Campanhas --------
    async listCampaigns() { await exigirUsuario(); return campanhas(); },
    async saveCampaign(mes, campanha) {
      await exigirUsuario();
      const [ano, m] = validar(anoMes, mes).split('-').map(Number) as [number, number];
      if (campanha === null) ok(await sb.from('campanhas').delete().eq('ano', ano).eq('mes', m));
      else {
        const c = validar(CampanhaInput, campanha);
        ok(await sb.from('campanhas').upsert({ ano, mes: m, nome: c.n, descricao: c.s || null, cor: c.c }));
      }
      return campanhas();
    },

    // -------- Usuários --------
    async listUsers() {
      await exigirUsuario();
      return exigir(await sb.from('perfis').select('id, nome, email, perfil, ativo').order('nome'));
    },
    async createUser(dados) {
      await exigirUsuario();
      const d = validar(NovoUsuarioInput, dados);
      // Criar acesso exige a chave de serviço → feito na Edge Function "criar-usuario"
      const { data, error } = await sb.functions.invoke<{ usuario: Usuario }>('criar-usuario', { body: d });
      if (error) {
        const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null) as { codigo?: string; erro?: string } | null;
        const codigo = corpo?.codigo === 'CONFLITO' || corpo?.codigo === 'SEM_PERMISSAO' || corpo?.codigo === 'NAO_AUTENTICADO' ? corpo.codigo : 'VALIDACAO';
        throw new ApiError(codigo, corpo?.erro ?? 'Não foi possível criar o acesso.');
      }
      if (!data) throw new ApiError('VALIDACAO', 'Não foi possível criar o acesso.');
      return data.usuario;
    },
    async updateUser(dados) {
      await exigirUsuario();
      const d = validar(AtualizarUsuarioInput, dados);
      const mudar: { perfil?: 'admin' | 'user'; ativo?: boolean } = {};
      if (d.perfil) mudar.perfil = d.perfil;
      if (d.ativo !== undefined) mudar.ativo = d.ativo;
      const u = ok(await sb.from('perfis').update(mudar).eq('id', d.id).select('id, nome, email, perfil, ativo').maybeSingle());
      if (!u) throw new ApiError('NAO_ENCONTRADO', 'Usuário não encontrado.');
      return u;
    },

    // -------- Só existe no protótipo --------
    async resetDemo() {
      throw new ApiError('SEM_PERMISSAO', 'Restaurar dados de exemplo só existe no modo protótipo.');
    },
  };
}
