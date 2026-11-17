// =====================================================================
// API SIMULADA (MOCK) — implementa o contrato com o localStorage.
// As regras de permissão e validação estão aqui de propósito: no sistema
// real elas precisam existir no SERVIDOR (a tela só esconde botões).
// =====================================================================
import { z } from 'zod';
import type { CalendarApi } from './contract';
import { ApiError } from './errors';
import { limpo, validar } from './comum';
import { criarBancoDemo, type Banco, type UsuarioDemo } from '../data/seed';
import {
  AtualizarUsuarioInput, CampanhaInput, EventoInput, LoginInput, MotivoInput,
  NovoUsuarioInput, SolicitacaoInput, anoMes, id as idSchema,
} from '../domain/schemas';
import {
  CATEGORIAS, CORES_CAMPANHA, ESCOPOS, PERFIS, STATUS_SOLICITACAO,
  type Escopo, type Evento, type Usuario,
} from '../domain/types';

const DB_KEY = 'mahanaim.db.v2';
const SES_KEY = 'mahanaim.session';
const LEMBRAR_DIAS = 30;
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MIN = 5;

// ---------- armazenamento (pode estar bloqueado em janela anônima) ----------
type Area = 'localStorage' | 'sessionStorage';
const ler = (a: Area, k: string): string | null => { try { return window[a].getItem(k); } catch { return null; } };
const gravar = (a: Area, k: string, v: string): void => { try { window[a].setItem(k, v); } catch { /* sem armazenamento */ } };
const apagar = (a: Area, k: string): void => { try { window[a].removeItem(k); } catch { /* sem armazenamento */ } };

// ---------- validação do que vem do armazenamento (não confiar cegamente) ----------
const opt = z.string().optional();
const EventoSalvo = z.object({
  id: z.string(), data: z.string(), c: z.enum(CATEGORIAS), n: z.string(), t: opt, l: opt, fim: opt, serie: opt,
});
const BancoSalvo = z.object({
  events: z.array(EventoSalvo),
  campanhas: z.record(z.string(), z.object({ n: z.string(), s: z.string(), c: z.enum(CORES_CAMPANHA) })),
  users: z.array(z.object({
    id: z.string(), nome: z.string(), email: z.string(), senha: z.string(), perfil: z.enum(PERFIS), ativo: z.boolean(),
  })),
  requests: z.array(z.object({
    id: z.string(), status: z.enum(STATUS_SOLICITACAO), autorId: z.string(), criadoEm: z.string(),
    evento: EventoSalvo.omit({ id: true, serie: true }),
    mensagem: opt, motivo: opt, revisadoPor: opt, revisadoEm: opt, eventoId: opt,
  })),
  seq: z.number().int(),
});
const SessaoSalva = z.object({ userId: z.string(), criadaEm: z.number(), expira: z.number().nullable() });
type Sessao = z.infer<typeof SessaoSalva>;

function carregar(): Banco {
  const raw = ler('localStorage', DB_KEY);
  if (raw) {
    try {
      const r = BancoSalvo.safeParse(JSON.parse(raw));
      if (r.success) return r.data;
      console.warn('Dados locais inválidos; voltando aos dados de exemplo.', r.error.issues[0]);
    } catch { /* JSON corrompido */ }
  }
  return criarBancoDemo();
}

// ---------- utilidades ----------
const clone = <T>(o: T): T => structuredClone(o);
const agora = () => new Date().toISOString().slice(0, 19);
const responder = <T>(v: T): Promise<T> => new Promise(r => setTimeout(() => r(clone(v)), 60));
const publico = (u: UsuarioDemo): Usuario => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo });

export function createMockApi(): CalendarApi {
  let db = carregar();
  const salvar = () => gravar('localStorage', DB_KEY, JSON.stringify(db));
  const novoId = (prefixo: string) => prefixo + ++db.seq;
  const tentativas = new Map<string, { falhas: number; ate: number }>();

  // ---------- sessão e permissões ----------
  function sessao(): Sessao | null {
    const raw = ler('localStorage', SES_KEY) ?? ler('sessionStorage', SES_KEY);
    if (!raw) return null;
    try {
      const s = SessaoSalva.parse(JSON.parse(raw));
      if (s.expira !== null && Date.now() > s.expira) { apagar('localStorage', SES_KEY); return null; }
      return s;
    } catch { return null; }
  }
  const usuarioAtual = (): UsuarioDemo | null => {
    const s = sessao();
    return (s && db.users.find(u => u.id === s.userId && u.ativo)) || null;
  };
  const exigirUsuario = (): UsuarioDemo => {
    const u = usuarioAtual();
    if (!u) throw new ApiError('NAO_AUTENTICADO', 'Sua sessão expirou. Entre novamente.');
    return u;
  };
  const exigirAdmin = (): UsuarioDemo => {
    const u = exigirUsuario();
    if (u.perfil !== 'admin') throw new ApiError('SEM_PERMISSAO', 'Acesso restrito a administradores.');
    return u;
  };
  const acharEvento = (id: string): Evento => {
    const e = db.events.find(x => x.id === id);
    if (!e) throw new ApiError('NAO_ENCONTRADO', 'Evento não encontrado.');
    return e;
  };
  const nomeDe = (id: string) => db.users.find(u => u.id === id)?.nome ?? '—';

  return {
    // -------- Autenticação --------
    async login(email, senha, lembrar) {
      const dados = validar(LoginInput, { email, senha, lembrar });
      const t = tentativas.get(dados.email);
      if (t && t.ate > Date.now()) {
        const min = Math.ceil((t.ate - Date.now()) / 60000);
        throw new ApiError('BLOQUEADO', `Muitas tentativas. Tente de novo em ${min} min.`);
      }
      const u = db.users.find(x => x.email === dados.email);
      if (!u || u.senha !== dados.senha) {
        const falhas = (t?.falhas ?? 0) + 1;
        tentativas.set(dados.email, { falhas, ate: falhas >= MAX_TENTATIVAS ? Date.now() + BLOQUEIO_MIN * 60000 : 0 });
        // Mesma mensagem para e-mail inexistente e senha errada: não revela quem tem conta.
        throw new ApiError('CREDENCIAIS', 'E-mail ou senha incorretos.');
      }
      if (!u.ativo) throw new ApiError('SEM_PERMISSAO', 'Este acesso está desativado. Fale com a liderança.');
      tentativas.delete(dados.email);
      const s: Sessao = { userId: u.id, criadaEm: Date.now(), expira: dados.lembrar ? Date.now() + LEMBRAR_DIAS * 864e5 : null };
      apagar('localStorage', SES_KEY); apagar('sessionStorage', SES_KEY);
      gravar(dados.lembrar ? 'localStorage' : 'sessionStorage', SES_KEY, JSON.stringify(s));
      return responder(publico(u));
    },
    async logout() {
      apagar('localStorage', SES_KEY); apagar('sessionStorage', SES_KEY);
      return responder(undefined);
    },
    async me() {
      const u = usuarioAtual();
      return responder(u ? publico(u) : null);
    },

    // -------- Eventos --------
    async listEvents() { exigirUsuario(); return responder(db.events); },
    async createEvent(dados) {
      exigirAdmin();
      const e: Evento = { id: novoId('e'), ...limpo(validar(EventoInput, dados)) };
      db.events.push(e); salvar();
      return responder(e);
    },
    async updateEvent(id, dados, escopo) {
      exigirAdmin();
      validar(idSchema, id);
      const esc: Escopo = validar(z.enum(ESCOPOS), escopo);
      const d = limpo(validar(EventoInput, dados));
      const atual = acharEvento(id);
      if (esc === 'proximos' && atual.serie) {
        // Na série, muda título, tipo, horário e local; as datas continuam as mesmas.
        for (const x of db.events) {
          if (x.serie !== atual.serie || x.data < atual.data) continue;
          x.c = d.c; x.n = d.n;
          if (d.t) x.t = d.t; else delete x.t;
          if (d.l) x.l = d.l; else delete x.l;
        }
        salvar();
        return responder(atual);
      }
      const novo: Evento = { id: atual.id, ...d }; // vira exceção (sai da série)
      db.events = db.events.map(x => (x.id === id ? novo : x));
      salvar();
      return responder(novo);
    },
    async deleteEvent(id, escopo) {
      exigirAdmin();
      const esc: Escopo = validar(z.enum(ESCOPOS), escopo);
      const atual = acharEvento(validar(idSchema, id));
      db.events = esc === 'proximos' && atual.serie
        ? db.events.filter(x => !(x.serie === atual.serie && x.data >= atual.data))
        : db.events.filter(x => x.id !== atual.id);
      salvar();
      return responder(undefined);
    },

    // -------- Solicitações --------
    async listRequests() {
      const u = exigirUsuario();
      const lista = u.perfil === 'admin' ? db.requests : db.requests.filter(r => r.autorId === u.id);
      return responder(lista.map(r => ({
        ...r, autorNome: nomeDe(r.autorId), revisorNome: r.revisadoPor ? nomeDe(r.revisadoPor) : undefined,
      })));
    },
    async createRequest(evento, mensagem) {
      const u = exigirUsuario();
      const d = validar(SolicitacaoInput, { evento, mensagem });
      const pendentes = db.requests.filter(r => r.autorId === u.id && r.status === 'pendente').length;
      if (pendentes >= 10) throw new ApiError('CONFLITO', 'Você já tem 10 solicitações pendentes. Aguarde a liderança responder.');
      const r = { id: novoId('r'), status: 'pendente' as const, autorId: u.id, criadoEm: agora(), evento: limpo(d.evento), mensagem: d.mensagem };
      db.requests.unshift(r); salvar();
      return responder(r);
    },
    async cancelRequest(id) {
      const u = exigirUsuario();
      const r = db.requests.find(x => x.id === id && x.autorId === u.id && x.status === 'pendente');
      if (!r) throw new ApiError('NAO_ENCONTRADO', 'Solicitação não encontrada.');
      db.requests = db.requests.filter(x => x !== r); salvar();
      return responder(undefined);
    },
    async approveRequest(id, eventoAjustado) {
      const admin = exigirAdmin();
      const r = db.requests.find(x => x.id === id && x.status === 'pendente');
      if (!r) throw new ApiError('NAO_ENCONTRADO', 'Solicitação não encontrada ou já respondida.');
      const dados = limpo(validar(EventoInput, eventoAjustado ?? r.evento));
      const e: Evento = { id: novoId('e'), ...dados };
      db.events.push(e);
      Object.assign(r, { status: 'aprovada', evento: dados, eventoId: e.id, revisadoPor: admin.id, revisadoEm: agora() });
      salvar();
      return responder(r);
    },
    async rejectRequest(id, motivo) {
      const admin = exigirAdmin();
      const m = validar(MotivoInput, motivo);
      const r = db.requests.find(x => x.id === id && x.status === 'pendente');
      if (!r) throw new ApiError('NAO_ENCONTRADO', 'Solicitação não encontrada ou já respondida.');
      Object.assign(r, { status: 'recusada', motivo: m, revisadoPor: admin.id, revisadoEm: agora() });
      salvar();
      return responder(r);
    },

    // -------- Campanhas --------
    async listCampaigns() { exigirUsuario(); return responder(db.campanhas); },
    async saveCampaign(mes, campanha) {
      exigirAdmin();
      const ym = validar(anoMes, mes);
      if (campanha === null) delete db.campanhas[ym];
      else db.campanhas[ym] = validar(CampanhaInput, campanha);
      salvar();
      return responder(db.campanhas);
    },

    // -------- Usuários --------
    async listUsers() { exigirAdmin(); return responder(db.users.map(publico)); },
    async createUser(dados) {
      exigirAdmin();
      const d = validar(NovoUsuarioInput, dados);
      if (db.users.some(u => u.email === d.email)) throw new ApiError('CONFLITO', 'Já existe um acesso com este e-mail.');
      const u: UsuarioDemo = { id: novoId('u'), ...d, ativo: true };
      db.users.push(u); salvar();
      return responder(publico(u));
    },
    async updateUser(dados) {
      const admin = exigirAdmin();
      const d = validar(AtualizarUsuarioInput, dados);
      const u = db.users.find(x => x.id === d.id);
      if (!u) throw new ApiError('NAO_ENCONTRADO', 'Usuário não encontrado.');
      if (u.id === admin.id && (d.perfil === 'user' || d.ativo === false))
        throw new ApiError('CONFLITO', 'Você não pode remover o seu próprio acesso de administrador.');
      if (d.perfil) u.perfil = d.perfil;
      if (d.ativo !== undefined) u.ativo = d.ativo;
      salvar();
      return responder(publico(u));
    },

    // -------- Somente no protótipo --------
    async resetDemo() { db = criarBancoDemo(); salvar(); return responder(undefined); },
  };
}
