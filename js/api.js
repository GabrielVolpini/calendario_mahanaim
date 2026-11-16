// =====================================================================
// API SIMULADA (MOCK)
// Este arquivo é o "contrato" entre a tela e o futuro backend.
// Hoje grava tudo no localStorage do navegador. Na fase de banco de dados,
// basta trocar o corpo de cada função por uma chamada fetch() ao servidor,
// mantendo os mesmos nomes, parâmetros e retornos.
//
// As regras de permissão estão aqui de propósito: no sistema real elas
// precisam ficar no SERVIDOR (a tela só esconde botões).
// =====================================================================
window.API = (function () {
  const DB_KEY = 'mahanaim.db.v1';
  const SES_KEY = 'mahanaim.session';
  const LEMBRAR_DIAS = 30;

  const clone = o => JSON.parse(JSON.stringify(o));
  const store = name => { try { return window[name]; } catch { return null; } };
  const ls = store('localStorage'), ss = store('sessionStorage');
  const get = (s, k) => { try { return s && s.getItem(k); } catch { return null; } };
  const set = (s, k, v) => { try { s && s.setItem(k, v); } catch {} };
  const del = (s, k) => { try { s && s.removeItem(k); } catch {} };

  let db = load();
  function load() {
    try { const raw = get(ls, DB_KEY); if (raw) return JSON.parse(raw); } catch {}
    return clone(window.SEED);
  }
  const save = () => set(ls, DB_KEY, JSON.stringify(db));
  const uid = p => p + (++db.seq);
  const now = () => new Date().toISOString().slice(0, 19);
  const ok = v => new Promise(r => setTimeout(() => r(v === undefined ? v : clone(v)), 80));
  const err = msg => { throw new Error(msg); };
  const pub = u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo });

  // ---- Sessão ----
  function session() {
    const raw = get(ls, SES_KEY) || get(ss, SES_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s.expira && Date.now() > s.expira) { del(ls, SES_KEY); return null; }
      return s;
    } catch { return null; }
  }
  function currentUser() {
    const s = session();
    const u = s && db.users.find(x => x.id === s.userId && x.ativo);
    return u || null;
  }
  const requireUser = () => currentUser() || err('Sessão expirada. Entre novamente.');
  const requireAdmin = () => { const u = requireUser(); return u.perfil === 'admin' ? u : err('Acesso restrito a administradores.'); };

  // ---- Validação de evento ----
  const CATS = ['feriado', 'evento', 'aniv', 'data', 'culto'];
  function cleanEvent(e) {
    const out = {
      data: String(e.data || ''), c: e.c, n: String(e.n || '').trim(),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.data)) err('Informe uma data válida.');
    if (!CATS.includes(out.c)) err('Escolha um tipo válido.');
    if (!out.n) err('Informe o título.');
    if (e.t) out.t = String(e.t);
    if (e.l && String(e.l).trim()) out.l = String(e.l).trim();
    if (e.fim && e.fim > out.data) out.fim = e.fim;
    return out;
  }

  return {
    // -------- Autenticação --------
    async login(email, senha, lembrar) {
      const u = db.users.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u || u.senha !== senha) err('E-mail ou senha incorretos.');
      if (!u.ativo) err('Este acesso está desativado. Fale com a liderança.');
      const s = { userId: u.id, criadaEm: Date.now(), expira: lembrar ? Date.now() + LEMBRAR_DIAS * 864e5 : null };
      del(ls, SES_KEY); del(ss, SES_KEY);
      set(lembrar ? ls : ss, SES_KEY, JSON.stringify(s));
      return ok(pub(u));
    },
    async logout() { del(ls, SES_KEY); del(ss, SES_KEY); return ok(); },
    async me() { const u = currentUser(); return ok(u ? pub(u) : null); },

    // -------- Eventos --------
    async listEvents() { requireUser(); return ok(db.events); },

    // escopo: 'um' (somente este) | 'proximos' (este e os próximos da série)
    async saveEvent(e, escopo = 'um') {
      requireAdmin();
      const data = cleanEvent(e);
      if (!e.id) { const n = { id: uid('e'), ...data }; db.events.push(n); save(); return ok(n); }
      const cur = db.events.find(x => x.id === e.id) || err('Evento não encontrado.');
      if (escopo === 'proximos' && cur.serie) {
        db.events.forEach(x => {
          if (x.serie === cur.serie && x.data >= cur.data) {
            x.c = data.c; x.n = data.n;
            data.t ? x.t = data.t : delete x.t;
            data.l ? x.l = data.l : delete x.l;
          }
        });
      } else {
        const keepId = cur.id;
        Object.keys(cur).forEach(k => delete cur[k]);
        Object.assign(cur, { id: keepId, ...data }); // vira exceção (sai da série)
      }
      save(); return ok(cur);
    },
    async deleteEvent(id, escopo = 'um') {
      requireAdmin();
      const cur = db.events.find(x => x.id === id) || err('Evento não encontrado.');
      db.events = escopo === 'proximos' && cur.serie
        ? db.events.filter(x => !(x.serie === cur.serie && x.data >= cur.data))
        : db.events.filter(x => x.id !== id);
      save(); return ok();
    },

    // -------- Solicitações --------
    async listRequests() {
      const u = requireUser();
      const list = u.perfil === 'admin' ? db.requests : db.requests.filter(r => r.autorId === u.id);
      const name = id => (db.users.find(x => x.id === id) || {}).nome || '—';
      return ok(list.map(r => ({ ...r, autorNome: name(r.autorId), revisorNome: r.revisadoPor ? name(r.revisadoPor) : undefined })));
    },
    async createRequest(evento, mensagem) {
      const u = requireUser();
      const r = { id: uid('r'), status: 'pendente', autorId: u.id, criadoEm: now(), evento: cleanEvent(evento) };
      if (mensagem && mensagem.trim()) r.mensagem = mensagem.trim();
      db.requests.unshift(r); save(); return ok(r);
    },
    async cancelRequest(id) {
      const u = requireUser();
      const r = db.requests.find(x => x.id === id && x.autorId === u.id && x.status === 'pendente') || err('Solicitação não encontrada.');
      db.requests = db.requests.filter(x => x !== r); save(); return ok();
    },
    // eventoEditado é opcional (admin ajusta antes de aprovar)
    async approveRequest(id, eventoEditado) {
      const a = requireAdmin();
      const r = db.requests.find(x => x.id === id && x.status === 'pendente') || err('Solicitação não encontrada.');
      const e = { id: uid('e'), ...cleanEvent(eventoEditado || r.evento) };
      db.events.push(e);
      Object.assign(r, { status: 'aprovada', evento: { ...e, id: undefined }, eventoId: e.id, revisadoPor: a.id, revisadoEm: now() });
      save(); return ok(r);
    },
    async rejectRequest(id, motivo) {
      const a = requireAdmin();
      const r = db.requests.find(x => x.id === id && x.status === 'pendente') || err('Solicitação não encontrada.');
      Object.assign(r, { status: 'recusada', revisadoPor: a.id, revisadoEm: now() });
      if (motivo && motivo.trim()) r.motivo = motivo.trim();
      save(); return ok(r);
    },

    // -------- Campanhas do mês --------
    async listCampaigns() { requireUser(); return ok(db.campanhas); },
    async saveCampaign(ym, camp) {
      requireAdmin();
      if (camp && camp.n && camp.n.trim()) db.campanhas[ym] = { n: camp.n.trim(), s: (camp.s || '').trim(), c: camp.c || 'azul' };
      else delete db.campanhas[ym];
      save(); return ok(db.campanhas);
    },

    // -------- Usuários --------
    async listUsers() { requireAdmin(); return ok(db.users.map(pub)); },
    async saveUser(u) {
      const a = requireAdmin();
      if (u.id) {
        const cur = db.users.find(x => x.id === u.id) || err('Usuário não encontrado.');
        if (cur.id === a.id && (u.perfil === 'user' || u.ativo === false)) err('Você não pode remover o seu próprio acesso de administrador.');
        if (u.perfil) cur.perfil = u.perfil;
        if (typeof u.ativo === 'boolean') cur.ativo = u.ativo;
        save(); return ok(pub(cur));
      }
      const email = String(u.email || '').trim().toLowerCase();
      if (!u.nome || !u.nome.trim()) err('Informe o nome.');
      if (!/^\S+@\S+\.\S+$/.test(email)) err('Informe um e-mail válido.');
      if (db.users.some(x => x.email.toLowerCase() === email)) err('Já existe um acesso com este e-mail.');
      if (!u.senha || u.senha.length < 6) err('A senha provisória precisa ter ao menos 6 caracteres.');
      const n = { id: uid('u'), nome: u.nome.trim(), email, senha: u.senha, perfil: u.perfil === 'admin' ? 'admin' : 'user', ativo: true };
      db.users.push(n); save(); return ok(pub(n));
    },

    // -------- Somente no protótipo --------
    async resetDemo() { db = clone(window.SEED); save(); return ok(); },
  };
})();
