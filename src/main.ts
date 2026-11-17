// =====================================================================
// TELA (front-end). Só conversa com o "servidor" através de `api`.
// =====================================================================
import './styles.css';
import { MODO_DEMO, api, isApiError, mensagemDoErro } from './api';
import { EventoInput, primeiraMensagem } from './domain/schemas';
import {
  CATEGORIAS, CORES_CAMPANHA,
  type AnoMes, type Campanhas, type Categoria, type CorCampanha, type DataIso, type Escopo,
  type Evento, type EventoDados, type SolicitacaoView, type StatusSolicitacao, type Usuario,
} from './domain/types';
import { $, $$, html, raw, setHtml, type SafeHtml } from './ui/dom';
import {
  MESES_C, cap, diaDaSemana, fmtDate, fmtShort, fmtWhen, hojeKey, horaParaInput, iniciais,
  inputParaHora, key, minutos, nomeMes, parseKey,
} from './ui/format';

// ---------- configuração de exibição ----------
const CATS: Record<Categoria, { label: string; one: string; ord: number }> = {
  feriado: { label: 'Feriados', one: 'Feriado', ord: 0 },
  evento: { label: 'Eventos especiais', one: 'Evento especial', ord: 1 },
  aniv: { label: 'Aniversários e homenagens', one: 'Aniversário ou homenagem', ord: 2 },
  data: { label: 'Datas comemorativas', one: 'Data comemorativa', ord: 3 },
  culto: { label: 'Cultos', one: 'Culto', ord: 4 },
};
const NOME_COR: Record<CorCampanha, string> = { azul: 'Azul', rosa: 'Rosa', amarelo: 'Amarelo', verde: 'Verde' };
const NOME_STATUS: Record<StatusSolicitacao, string> = { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' };

interface Mes { y: number; m: number }
const START: Mes = { y: 2026, m: 10 }, END: Mes = { y: 2027, m: 11 };
const idx = (c: Mes) => (c.y - START.y) * 12 + (c.m - START.m);
const TOTAL = idx(END) + 1;
const fromIdx = (i: number): Mes => ({ y: START.y + Math.floor((START.m + i) / 12), m: (START.m + i) % 12 });
const dentroDoPeriodo = (c: Mes) => idx(c) >= 0 && idx(c) < TOTAL;
const color = (c: string) => `var(--${c})`;

/** Um item como aparece num dia (evento publicado ou pedido pendente). */
interface ItemDia extends EventoDados {
  id?: string;
  serie?: string | undefined;
  pend: boolean;
  reqId?: string;
  autor?: string;
  dia?: number;
  total?: number;
}

// ---------- estado ----------
let ME: Usuario | null = null;
let EVENTS: Evento[] = [];
let REQS: SolicitacaoView[] = [];
let CAMPS: Campanhas = {};
let IDX: Record<DataIso, ItemDia[]> = {};
let cur: Mes = { ...START };
let view: 'cal' | 'list' = 'cal';
const active = new Set<Categoria>(CATEGORIAS);

const isAdmin = () => ME?.perfil === 'admin';

// ---------- apresentação ----------
const sub = (e: ItemDia) =>
  [e.l, e.total ? (e.l ? `dia ${e.dia} de ${e.total}` : `Dia ${e.dia} de ${e.total}`) : null].filter(Boolean).join(' · ');
const label = (e: ItemDia) => e.n + (sub(e) ? ` – ${sub(e)}` : '');
const dot = (c: Categoria, pend = false): SafeHtml =>
  html`<i class="dot${pend ? ' pend' : ''}" style="--c:${color(c)}"></i>`;
const cmp = (a: ItemDia, b: ItemDia) =>
  Number(a.pend) - Number(b.pend) || CATS[a.c].ord - CATS[b.c].ord || minutos(a.t) - minutos(b.t);

let toastTimer: number | undefined;
function toast(msg: string, ruim = false): void {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (ruim ? ' bad' : '');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.className = 'toast'; }, 2600);
}
/** Trata qualquer erro: sessão expirada volta ao login; o resto vira aviso. */
function falha(e: unknown): void {
  toast(mensagemDoErro(e), true);
  if (isApiError(e) && e.codigo === 'NAO_AUTENTICADO') showLogin();
}

// ---------- dados ----------
function buildIndex(): void {
  IDX = {};
  const put = (k: DataIso, o: ItemDia) => { (IDX[k] ??= []).push(o); };
  const spread = (e: EventoDados, extra: Omit<ItemDia, keyof EventoDados>) => {
    if (!e.fim) return put(e.data, { ...e, ...extra });
    const s = parseKey(e.data), total = Math.round((parseKey(e.fim).getTime() - s.getTime()) / 864e5) + 1;
    for (let i = 0, d = new Date(s); i < total; i++, d.setDate(d.getDate() + 1))
      put(key(d.getFullYear(), d.getMonth(), d.getDate()), { ...e, ...extra, dia: i + 1, total });
  };
  EVENTS.forEach(e => spread(e, { id: e.id, serie: e.serie, pend: false }));
  // Pendentes aparecem tracejados para o autor e para os admins
  REQS.filter(r => r.status === 'pendente').forEach(r => spread(r.evento, { pend: true, reqId: r.id, autor: r.autorNome }));
}
const eventsOf = (k: DataIso) => (IDX[k] ?? []).filter(e => active.has(e.c)).sort(cmp);

async function loadData(): Promise<void> {
  [EVENTS, REQS, CAMPS] = await Promise.all([api.listEvents(), api.listRequests(), api.listCampaigns()]);
  buildIndex();
  const pend = REQS.filter(r => r.status === 'pendente').length;
  const rc = $('#reqCount');
  rc.hidden = !(isAdmin() && pend);
  rc.textContent = String(pend);
}
async function refresh(): Promise<void> {
  try { await loadData(); render(); } catch (e) { falha(e); }
}

// =====================================================================
// LOGIN
// =====================================================================
const lg = {
  form: $<HTMLFormElement>('#loginForm'),
  email: $<HTMLInputElement>('#lgEmail'),
  pass: $<HTMLInputElement>('#lgPass'),
  remember: $<HTMLInputElement>('#lgRemember'),
  err: $('#lgErr'),
  submit: $<HTMLButtonElement>('#lgSubmit'),
};

function showLogin(): void {
  ME = null;
  closeAll();
  $('#appScreen').hidden = true;
  $('#loginScreen').hidden = false;
  lg.err.hidden = true;
  lg.pass.value = '';
  setTimeout(() => lg.email.focus(), 0);
}
lg.form.addEventListener('submit', async ev => {
  ev.preventDefault();
  lg.submit.disabled = true;
  lg.err.hidden = true;
  try {
    ME = await api.login(lg.email.value, lg.pass.value, lg.remember.checked);
    await enterApp();
  } catch (e) {
    lg.err.textContent = mensagemDoErro(e);
    lg.err.hidden = false;
  }
  lg.submit.disabled = false;
});
$$<HTMLButtonElement>('[data-demo]').forEach(b => b.addEventListener('click', () => {
  const admin = b.dataset['demo'] === 'admin';
  lg.email.value = admin ? 'admin@mahanaim.demo' : 'membro@mahanaim.demo';
  lg.pass.value = admin ? 'admin123' : 'membro123';
  lg.form.requestSubmit();
}));
$('#lgForgot').addEventListener('click', () => toast('Recuperação de senha por e-mail ainda não está disponível. Fale com a liderança.'));
// Botões de acesso de demonstração só existem no modo protótipo
$<HTMLElement>('#loginForm .demo').hidden = !MODO_DEMO;

async function enterApp(): Promise<void> {
  if (!ME) return showLogin();
  $('#loginScreen').hidden = true;
  $('#appScreen').hidden = false;
  const adm = isAdmin();
  $('#avatar').textContent = iniciais(ME.nome);
  $('#whoName').textContent = ME.nome.split(' ')[0] ?? ME.nome;
  $('#meName').textContent = ME.nome;
  $('#meEmail').textContent = ME.email;
  const role = $('#meRole');
  role.textContent = adm ? 'Admin' : 'User · visualização';
  role.className = 'badge' + (adm ? ' admin' : '');
  $('#btnRequests').hidden = !adm;
  $('#btnUsers').hidden = !adm;
  $('#mMine').hidden = adm;
  $('#mReset').hidden = !adm || !MODO_DEMO;
  const [longo, curto] = adm ? ['Novo evento', 'Novo'] : ['Solicitar evento', 'Solicitar'];
  setHtml($('#btnNew'), html`<span aria-hidden="true">+</span> <span class="lbl-long">${longo}</span><span class="lbl-short">${curto}</span>`);
  buildMonths();
  buildLegend();
  try { await loadData(); } catch (e) { return falha(e); }
  render();
}

// ---------- menu do usuário ----------
const menu = $<HTMLDetailsElement>('#userMenu');
document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target as Node)) menu.open = false; });
$('#mLogout').addEventListener('click', async () => {
  menu.open = false;
  await api.logout();
  showLogin();
  toast('Você saiu.');
});
$('#mMine').addEventListener('click', () => { menu.open = false; openRequests(); });
$('#mReset').addEventListener('click', async () => {
  menu.open = false;
  const ok = await ask({ title: 'Restaurar dados de exemplo?', msg: 'Todas as alterações feitas neste navegador serão descartadas. Isso existe só no protótipo.', ok: 'Restaurar', danger: true });
  if (!ok) return;
  await api.resetDemo();
  ME = await api.me();
  if (!ME) return showLogin();
  await refresh();
  toast('Dados de exemplo restaurados.');
});
$('#btnNew').addEventListener('click', () => openForm(isAdmin() ? { mode: 'create', ev: { data: defaultDate() } } : { mode: 'request', ev: { data: defaultDate() } }));
$('#btnRequests').addEventListener('click', () => openRequests());
$('#btnUsers').addEventListener('click', () => { void openUsers(); });

function defaultDate(): DataIso {
  const t = new Date();
  return t.getFullYear() === cur.y && t.getMonth() === cur.m ? key(cur.y, cur.m, t.getDate()) : key(cur.y, cur.m, 1);
}

// =====================================================================
// CALENDÁRIO
// =====================================================================
function buildMonths(): void {
  const nav = $('#months');
  nav.replaceChildren();
  for (let i = 0; i < TOTAL; i++) {
    const c = fromIdx(i);
    const b = document.createElement('button');
    b.textContent = `${MESES_C[c.m]}/${String(c.y).slice(2)}`;
    b.dataset['i'] = String(i);
    b.addEventListener('click', () => { cur = c; render(); });
    nav.appendChild(b);
  }
}
function buildLegend(): void {
  const lgd = $('#legend');
  lgd.replaceChildren();
  CATEGORIAS.forEach(c => {
    const b = document.createElement('button');
    setHtml(b, html`${dot(c)}${CATS[c].label}`);
    b.setAttribute('aria-pressed', String(active.has(c)));
    b.addEventListener('click', () => {
      if (active.has(c)) active.delete(c); else active.add(c);
      b.setAttribute('aria-pressed', String(active.has(c)));
      render();
    });
    lgd.appendChild(b);
  });
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = isAdmin() ? 'Toque num dia para ver, adicionar ou editar.' : 'Toque num dia para ver tudo ou solicitar um evento.';
  lgd.appendChild(hint);
}

function render(): void {
  $('#title').textContent = `${cap(nomeMes(cur.m))} de ${cur.y}`;
  $<HTMLButtonElement>('#prev').disabled = idx(cur) <= 0;
  $<HTMLButtonElement>('#next').disabled = idx(cur) >= TOTAL - 1;
  $$<HTMLButtonElement>('#months button').forEach(b => {
    const on = Number(b.dataset['i']) === idx(cur);
    b.setAttribute('aria-current', String(on));
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  renderCampaign();
  $('#calView').hidden = view !== 'cal';
  $('#listView').hidden = view !== 'list';
  if (view === 'cal') renderGrid(); else renderList();
}

function renderCampaign(): void {
  const ym: AnoMes = key(cur.y, cur.m, 1).slice(0, 7), camp = CAMPS[ym];
  const old = $('#campaign');
  const box = document.createElement('div'); // recria para limpar eventos antigos
  box.id = 'campaign';
  old.replaceWith(box);
  if (camp) {
    box.className = 'campaign';
    setHtml(box, html`<i class="ribbon" style="background:${color(camp.c)}"></i><strong>${camp.n}</strong><span>${camp.s}</span>${isAdmin() ? raw('<button class="btn sm ghost edit">Editar</button>') : ''}`);
    if (isAdmin()) $('.edit', box).addEventListener('click', () => openCampaign(ym));
  } else if (isAdmin()) {
    box.className = 'campaign add';
    box.textContent = '+ Adicionar campanha do mês';
    box.setAttribute('role', 'button');
    box.tabIndex = 0;
    box.addEventListener('click', () => openCampaign(ym));
    box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCampaign(ym); } });
  }
}

function renderGrid(): void {
  const { y, m } = cur, grid = $('#grid');
  grid.replaceChildren();
  const lead = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate(), hoje = hojeKey();
  const blank = () => { const b = document.createElement('div'); b.className = 'day blank'; return b; };
  for (let i = 0; i < lead; i++) grid.appendChild(blank());
  for (let d = 1; d <= dim; d++) {
    const k = key(y, m, d), list = eventsOf(k), w = new Date(y, m, d).getDay();
    const cell = document.createElement('div');
    cell.className = 'day' + (w === 0 ? ' sun' : '') + (k === hoje ? ' today' : '');
    if (list.some(e => e.c === 'feriado' && !e.pend)) cell.classList.add('hol');
    const hl = list.find(e => e.c !== 'culto' && !e.pend);
    setHtml(cell, html`
      ${hl ? html`<span class="bar" style="background:${color(hl.c)}"></span>` : ''}
      <span class="num">${d}</span><span class="add-hint" aria-hidden="true">+</span>
      ${list.length ? html`
        <ul class="ev">${list.slice(0, 3).map(e => html`
          <li class="${e.pend ? 'pend' : ''}" title="${(e.t ? e.t + ' ' : '') + label(e) + (e.pend ? ' (pendente)' : '')}">
            ${dot(e.c, e.pend)}${e.t ? html`<span class="t">${e.t}</span>` : ''}<span class="n">${label(e)}</span>
          </li>`)}
        </ul>
        ${list.length > 3 ? html`<span class="more">+${list.length - 3}</span>` : ''}
        <div class="dots">${list.map(e => dot(e.c, e.pend))}</div>` : ''}
    `);
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${d} de ${nomeMes(m)}, ${list.length} ${list.length === 1 ? 'item' : 'itens'}`);
    cell.addEventListener('click', () => openDay(k));
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(k); } });
    grid.appendChild(cell);
  }
  const trail = (7 - ((lead + dim) % 7)) % 7;
  for (let i = 0; i < trail; i++) grid.appendChild(blank());
}

function renderList(): void {
  const { y, m } = cur, box = $('#listView');
  box.replaceChildren();
  const dim = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const k = key(y, m, d), list = eventsOf(k);
    if (!list.length) continue;
    const row = document.createElement('div');
    row.className = 'row';
    setHtml(row, html`<div class="date">${d} de ${nomeMes(m)}<small>${diaDaSemana(k)}</small></div>
      <ul>${list.map(e => html`<li class="${e.pend ? 'pend' : ''}">${dot(e.c, e.pend)}<span class="t">${e.t ?? ''}</span><span>${e.n}${sub(e) ? html` <span class="l">– ${sub(e)}</span>` : ''}${e.pend ? raw(' <span class="badge pendente">Pendente</span>') : ''}</span></li>`)}</ul>`);
    row.addEventListener('click', () => openDay(k));
    box.appendChild(row);
  }
  if (!box.children.length) setHtml(box, html`<p class="empty">Nenhum item neste mês com os filtros escolhidos. Ative mais tipos na legenda abaixo.</p>`);
}

// =====================================================================
// DIÁLOGO DO DIA
// =====================================================================
const dayDlg = $<HTMLDialogElement>('#dayDlg');
let openDayKey: DataIso | null = null;

function openDay(k: DataIso): void {
  openDayKey = k;
  const list = eventsOf(k), adm = isAdmin();
  $('#dayTitle').textContent = fmtDate(k);
  $('#daySub').textContent = cap(diaDaSemana(k));
  const ul = $('#dayList');
  setHtml(ul, list.length
    ? html`${list.map((e, i) => {
        let acts: SafeHtml = raw('');
        if (e.pend) acts = adm ? html`<button class="btn sm" data-review="${i}">Revisar</button>` : raw('<span class="badge pendente">Pendente</span>');
        else if (adm) acts = html`<button class="iconbtn sm" data-edit="${i}" aria-label="Editar ${e.n}" title="Editar">✎</button><button class="iconbtn sm" data-del="${i}" aria-label="Excluir ${e.n}" title="Excluir">🗑</button>`;
        const kind = e.pend ? `Aguardando aprovação · enviado por ${e.autor ?? '—'}` : CATS[e.c].label + (e.serie ? ' · recorrente' : '');
        return html`<li class="${e.pend ? 'pend' : ''}">${dot(e.c, e.pend)}<span class="t">${e.t ?? ''}</span><span class="n">${e.n}${sub(e) ? html`<span class="l">${sub(e)}</span>` : ''}<span class="k">${kind}</span></span><span class="acts">${acts}</span></li>`;
      })}`
    : html`<li style="display:block;color:var(--muted)">Nenhum item neste dia.</li>`);
  const item = (b: HTMLElement, attr: string) => list[Number(b.dataset[attr])];
  const evento = (it: ItemDia | undefined) => (it?.id ? EVENTS.find(x => x.id === it.id) : undefined);
  $$('[data-edit]', ul).forEach(b => b.addEventListener('click', () => {
    const e = evento(item(b, 'edit')); if (e) openForm({ mode: 'edit', ev: e });
  }));
  $$('[data-del]', ul).forEach(b => b.addEventListener('click', () => {
    const e = evento(item(b, 'del')); if (e) void deleteEvent(e);
  }));
  $$('[data-review]', ul).forEach(b => b.addEventListener('click', () => { dayDlg.close(); openRequests('pendente'); }));
  const add = $<HTMLButtonElement>('#dayAdd');
  add.textContent = adm ? '+ Adicionar neste dia' : '+ Solicitar evento neste dia';
  add.onclick = () => openForm(adm ? { mode: 'create', ev: { data: k } } : { mode: 'request', ev: { data: k } });
  if (!dayDlg.open) dayDlg.showModal();
}
const reopenDay = () => { if (openDayKey && dayDlg.open) openDay(openDayKey); };

async function deleteEvent(e: Evento): Promise<void> {
  const r = await ask({ title: 'Excluir item?', msg: `${e.n} · ${fmtShort(e.data)}`, ok: 'Excluir', danger: true, scope: !!e.serie });
  if (!r) return;
  try {
    await api.deleteEvent(e.id, r.scope);
    await refresh();
    reopenDay();
    toast(r.scope === 'proximos' ? 'Série excluída a partir desta data.' : 'Item excluído.');
  } catch (err) { falha(err); }
}

// =====================================================================
// FORMULÁRIO DE EVENTO / SOLICITAÇÃO
// =====================================================================
type FormCtx =
  | { mode: 'create' | 'request'; ev: Partial<EventoDados> }
  | { mode: 'edit'; ev: Evento }
  | { mode: 'review'; ev: EventoDados; reqId: string; autor: string };

const f = {
  dlg: $<HTMLDialogElement>('#formDlg'),
  form: $<HTMLFormElement>('#evForm'),
  title: $<HTMLInputElement>('#fTitle'),
  cat: $<HTMLSelectElement>('#fCat'),
  date: $<HTMLInputElement>('#fDate'),
  time: $<HTMLInputElement>('#fTime'),
  multi: $<HTMLInputElement>('#fMulti'),
  endWrap: $('#fEndWrap'),
  end: $<HTMLInputElement>('#fEnd'),
  loc: $<HTMLInputElement>('#fLoc'),
  scope: $<HTMLFieldSetElement>('#fScope'),
  msgWrap: $('#fMsgWrap'),
  msg: $<HTMLTextAreaElement>('#fMsg'),
  note: $('#fNote'),
  err: $('#fErr'),
  submit: $<HTMLButtonElement>('#fSubmit'),
};
const radioEscopo = (name: string): Escopo =>
  $<HTMLInputElement>(`input[name=${name}]:checked`).value === 'proximos' ? 'proximos' : 'um';

setHtml(f.cat, html`${CATEGORIAS.map(c => html`<option value="${c}">${CATS[c].one}</option>`)}`);
f.multi.addEventListener('change', () => { f.endWrap.hidden = !f.multi.checked; });
$$<HTMLInputElement>('input[name=scope]').forEach(r => r.addEventListener('change', () => {
  f.date.disabled = r.value === 'proximos' && r.checked;
}));
let formCtx: FormCtx | null = null;

function openForm(ctx: FormCtx): void {
  formCtx = ctx;
  const e = ctx.ev;
  const textos: Record<FormCtx['mode'], [string, string, string]> = {
    create: ['Novo evento', 'Será publicado direto no calendário.', 'Salvar'],
    edit: ['Editar item', e.c ? CATS[e.c].one : '', 'Salvar alterações'],
    request: ['Solicitar evento', 'Sua solicitação vai para a liderança aprovar.', 'Enviar solicitação'],
    review: ['Ajustar e aprovar', ctx.mode === 'review' ? `Pedido de ${ctx.autor}` : '', 'Aprovar com ajustes'],
  };
  const [titulo, subtitulo, botao] = textos[ctx.mode];
  $('#formTitle').textContent = titulo;
  $('#formSub').textContent = subtitulo;
  f.submit.textContent = botao;
  f.submit.className = 'btn ' + (ctx.mode === 'review' ? 'okb' : 'primary');
  f.title.value = e.n ?? '';
  f.cat.value = e.c ?? 'evento';
  f.date.value = e.data ?? '';
  f.date.disabled = false;
  f.time.value = horaParaInput(e.t);
  f.multi.checked = !!e.fim;
  f.endWrap.hidden = !e.fim;
  f.end.value = e.fim ?? '';
  f.loc.value = e.l ?? '';
  f.scope.hidden = !(ctx.mode === 'edit' && ctx.ev.serie);
  $<HTMLInputElement>('input[name=scope][value=um]').checked = true;
  f.msgWrap.hidden = ctx.mode !== 'request';
  f.msg.value = '';
  f.note.hidden = !(ctx.mode === 'request' || ctx.mode === 'review');
  f.note.textContent = ctx.mode === 'request'
    ? 'Enquanto não for aprovado, o evento aparece tracejado só para você e para a liderança.'
    : 'As alterações substituem o que foi pedido. O solicitante verá o evento já ajustado.';
  f.err.hidden = true;
  f.dlg.showModal();
  setTimeout(() => f.title.focus(), 0);
}

f.form.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!formCtx) return;
  const ctx = formCtx;
  const mostrarErro = (m: string) => { f.err.textContent = m; f.err.hidden = false; };
  f.err.hidden = true;

  // Validação na tela (resposta imediata). A API valida de novo: nunca confiar só na tela.
  const candidato = {
    n: f.title.value, c: f.cat.value, data: f.date.value, t: inputParaHora(f.time.value),
    l: f.loc.value, fim: f.multi.checked ? f.end.value : '',
  };
  if (f.multi.checked && !f.end.value) return mostrarErro('Informe a data final.');
  const v = EventoInput.safeParse(candidato);
  if (!v.success) return mostrarErro(primeiraMensagem(v.error));
  const dados: EventoDados = v.data;

  const escopo: Escopo = f.scope.hidden ? 'um' : radioEscopo('scope');
  f.submit.disabled = true;
  try {
    switch (ctx.mode) {
      case 'create': await api.createEvent(dados); toast('Evento publicado.'); break;
      case 'edit':
        await api.updateEvent(ctx.ev.id, dados, escopo);
        toast(escopo === 'proximos' ? 'Série atualizada a partir desta data.' : 'Alterações salvas.');
        break;
      case 'request': await api.createRequest(dados, f.msg.value); toast('Solicitação enviada para a liderança.'); break;
      case 'review': await api.approveRequest(ctx.reqId, dados); toast('Solicitação aprovada com ajustes.'); break;
    }
    f.dlg.close();
    await refresh();
    // Criado pelo botão do topo: leva o calendário até o mês do evento
    if (!dayDlg.open && ctx.mode !== 'review') {
      const d = parseKey(dados.data), c = { y: d.getFullYear(), m: d.getMonth() };
      if (dentroDoPeriodo(c)) { cur = c; render(); }
    }
    reopenDay();
    if (reqDlg.open) renderRequests();
  } catch (err) {
    mostrarErro(mensagemDoErro(err));
    if (isApiError(err) && err.codigo === 'NAO_AUTENTICADO') showLogin();
  }
  f.submit.disabled = false;
});

// =====================================================================
// CONFIRMAÇÃO GENÉRICA
// =====================================================================
interface AskOpts { title: string; msg?: string; ok: string; danger?: boolean; scope?: boolean; text?: string }
interface AskResult { scope: Escopo; text: string }

function ask(o: AskOpts): Promise<AskResult | null> {
  return new Promise(resolve => {
    const dlg = $<HTMLDialogElement>('#askDlg');
    const okBtn = $<HTMLButtonElement>('#askOk');
    const txt = $<HTMLTextAreaElement>('#askText');
    $('#askTitle').textContent = o.title;
    $('#askMsg').textContent = o.msg ?? '';
    okBtn.textContent = o.ok;
    okBtn.className = 'btn ' + (o.danger ? 'danger' : 'primary');
    $('#askScope').hidden = !o.scope;
    $<HTMLInputElement>('input[name=askScope][value=um]').checked = true;
    $('#askTextWrap').hidden = !o.text;
    txt.value = '';
    if (o.text) $('#askTextLabel').textContent = o.text;
    $('#askBody').hidden = !o.scope && !o.text;
    let done = false;
    const finish = (v: AskResult | null) => { if (done) return; done = true; dlg.close(); resolve(v); };
    $<HTMLFormElement>('#askForm').onsubmit = e => { e.preventDefault(); finish({ scope: radioEscopo('askScope'), text: txt.value }); };
    $<HTMLButtonElement>('#askCancel').onclick = () => finish(null);
    dlg.onclose = () => finish(null);
    dlg.showModal();
    setTimeout(() => (o.text ? txt : okBtn).focus(), 0);
  });
}

// =====================================================================
// SOLICITAÇÕES
// =====================================================================
const reqDlg = $<HTMLDialogElement>('#reqDlg');
let reqTab: StatusSolicitacao = 'pendente';

function openRequests(tab: StatusSolicitacao = 'pendente'): void {
  reqTab = tab;
  $('#reqTitle').textContent = isAdmin() ? 'Solicitações' : 'Minhas solicitações';
  $('#reqSub').textContent = isAdmin()
    ? 'Tudo o que entra no calendário a pedido dos membros passa por aqui.'
    : 'Acompanhe o que você pediu para a liderança.';
  renderRequests();
  if (!reqDlg.open) reqDlg.showModal();
}

function renderRequests(): void {
  const abas: [StatusSolicitacao, string][] = [['pendente', 'Pendentes'], ['aprovada', 'Aprovadas'], ['recusada', 'Recusadas']];
  const tabs = $('#reqTabs');
  setHtml(tabs, html`${abas.map(([k, l]) =>
    html`<button role="tab" aria-selected="${String(k === reqTab)}" data-tab="${k}">${l} (${REQS.filter(r => r.status === k).length})</button>`)}`);
  $$<HTMLButtonElement>('button', tabs).forEach(b => b.addEventListener('click', () => {
    const t = abas.find(([k]) => k === b.dataset['tab']);
    if (t) { reqTab = t[0]; renderRequests(); }
  }));

  const list = REQS.filter(r => r.status === reqTab), adm = isAdmin(), box = $('#reqList');
  if (!list.length) {
    setHtml(box, html`<p class="empty">${reqTab === 'pendente' ? 'Nada aguardando aprovação.' : 'Nenhuma solicitação aqui.'}</p>`);
    return;
  }
  setHtml(box, html`${list.map(r => {
    const e = r.evento;
    const quando = fmtShort(e.data) + (e.fim ? ` a ${fmtShort(e.fim)}` : '') + (e.t ? ` · ${e.t}` : '');
    const acoes = r.status !== 'pendente' ? '' : adm
      ? html`<div class="acts"><button class="btn okb sm" data-ok="${r.id}">Aprovar</button><button class="btn sm" data-adjust="${r.id}">Ajustar e aprovar</button><button class="btn sm danger" data-no="${r.id}">Recusar</button><button class="btn sm ghost" data-goto="${r.id}">Ver no calendário</button></div>`
      : html`<div class="acts"><button class="btn sm danger" data-cancel="${r.id}">Cancelar solicitação</button></div>`;
    const resposta = r.status === 'pendente' ? '' : html`<div class="reply"><b>${NOME_STATUS[r.status]} por ${r.revisorNome ?? '—'}</b> · ${r.revisadoEm ? fmtWhen(r.revisadoEm) : ''}${r.motivo ? html`<blockquote>${r.motivo}</blockquote>` : ''}</div>`;
    return html`<article class="card">
      <div class="head"><div><h3>${dot(e.c)}${e.n}</h3><div class="meta">${quando}${e.l ? ` · ${e.l}` : ''} · ${CATS[e.c].one}</div></div><span class="badge ${r.status}">${NOME_STATUS[r.status]}</span></div>
      ${r.mensagem ? html`<blockquote>${r.mensagem}</blockquote>` : ''}
      <div class="by">Enviada por ${r.autorNome} · ${fmtWhen(r.criadoEm)}</div>
      ${resposta}${acoes}
    </article>`;
  })}`);

  const porId = (b: HTMLElement, attr: string) => REQS.find(r => r.id === b.dataset[attr]);
  $$<HTMLButtonElement>('[data-ok]', box).forEach(b => b.addEventListener('click', async () => {
    const r = porId(b, 'ok'); if (!r) return;
    b.disabled = true;
    try { await api.approveRequest(r.id); await refresh(); renderRequests(); toast('Aprovada e publicada no calendário.'); }
    catch (e) { falha(e); b.disabled = false; }
  }));
  $$('[data-adjust]', box).forEach(b => b.addEventListener('click', () => {
    const r = porId(b, 'adjust'); if (r) openForm({ mode: 'review', ev: r.evento, reqId: r.id, autor: r.autorNome });
  }));
  $$('[data-no]', box).forEach(b => b.addEventListener('click', async () => {
    const r = porId(b, 'no'); if (!r) return;
    const res = await ask({ title: 'Recusar solicitação?', msg: `${r.evento.n} · ${fmtShort(r.evento.data)}`, ok: 'Recusar', danger: true, text: `Motivo para ${r.autorNome} (opcional)` });
    if (!res) return;
    try { await api.rejectRequest(r.id, res.text); await refresh(); renderRequests(); toast('Solicitação recusada.'); }
    catch (e) { falha(e); }
  }));
  $$('[data-cancel]', box).forEach(b => b.addEventListener('click', async () => {
    const r = porId(b, 'cancel'); if (!r) return;
    const res = await ask({ title: 'Cancelar solicitação?', msg: 'Ela será retirada da fila da liderança.', ok: 'Cancelar solicitação', danger: true });
    if (!res) return;
    try { await api.cancelRequest(r.id); await refresh(); renderRequests(); toast('Solicitação cancelada.'); }
    catch (e) { falha(e); }
  }));
  $$('[data-goto]', box).forEach(b => b.addEventListener('click', () => {
    const r = porId(b, 'goto'); if (!r) return;
    const d = parseKey(r.evento.data);
    cur = { y: d.getFullYear(), m: d.getMonth() };
    reqDlg.close();
    render();
    openDay(r.evento.data);
  }));
}

// =====================================================================
// USUÁRIOS (admin)
// =====================================================================
const usersDlg = $<HTMLDialogElement>('#usersDlg');
const uf = {
  form: $<HTMLFormElement>('#userForm'),
  name: $<HTMLInputElement>('#uName'),
  email: $<HTMLInputElement>('#uEmail'),
  pass: $<HTMLInputElement>('#uPass'),
  role: $<HTMLSelectElement>('#uRole'),
  err: $('#uErr'),
};

async function openUsers(): Promise<void> {
  try { await renderUsers(); } catch (e) { return falha(e); }
  uf.err.hidden = true;
  uf.form.reset();
  usersDlg.showModal();
}
async function renderUsers(): Promise<void> {
  const users = await api.listUsers(), box = $('#usersList');
  setHtml(box, html`${users.map(u => {
    const eu = u.id === ME?.id;
    return html`<div class="user-row${u.ativo ? '' : ' off'}">
      <div><b>${u.nome}${eu ? raw(' <span class="badge">você</span>') : ''}${u.ativo ? '' : raw(' <span class="badge">desativado</span>')}</b><small>${u.email}</small></div>
      <select data-role="${u.id}" aria-label="Perfil de ${u.nome}" ${eu ? raw('disabled') : ''}>
        <option value="user" ${u.perfil === 'user' ? raw('selected') : ''}>User</option>
        <option value="admin" ${u.perfil === 'admin' ? raw('selected') : ''}>Admin</option>
      </select>
      <button class="btn sm ${u.ativo ? 'danger' : ''}" data-toggle="${u.id}" ${eu ? raw('disabled') : ''}>${u.ativo ? 'Desativar' : 'Reativar'}</button>
    </div>`;
  })}`);
  $$<HTMLSelectElement>('[data-role]', box).forEach(s => s.addEventListener('change', async () => {
    const perfil = s.value === 'admin' ? 'admin' : 'user';
    try { await api.updateUser({ id: s.dataset['role'] ?? '', perfil }); toast('Perfil atualizado.'); } catch (e) { falha(e); }
    await renderUsers();
  }));
  $$<HTMLButtonElement>('[data-toggle]', box).forEach(b => b.addEventListener('click', async () => {
    const u = users.find(x => x.id === b.dataset['toggle']); if (!u) return;
    try { await api.updateUser({ id: u.id, ativo: !u.ativo }); toast(u.ativo ? 'Acesso desativado.' : 'Acesso reativado.'); } catch (e) { falha(e); }
    await renderUsers();
  }));
}
uf.form.addEventListener('submit', async ev => {
  ev.preventDefault();
  uf.err.hidden = true;
  try {
    await api.createUser({ nome: uf.name.value, email: uf.email.value, senha: uf.pass.value, perfil: uf.role.value === 'admin' ? 'admin' : 'user' });
    uf.form.reset();
    await renderUsers();
    toast('Acesso criado.');
  } catch (e) {
    uf.err.textContent = mensagemDoErro(e);
    uf.err.hidden = false;
  }
});

// =====================================================================
// CAMPANHA DO MÊS (admin)
// =====================================================================
const campDlg = $<HTMLDialogElement>('#campDlg');
let campYm: AnoMes | null = null;
setHtml($('#cColors'), html`${CORES_CAMPANHA.map(c =>
  html`<label title="${NOME_COR[c]}"><input type="radio" name="campColor" value="${c}" aria-label="${NOME_COR[c]}"><i style="--c:${color(c)}"></i></label>`)}`);

function openCampaign(ym: AnoMes): void {
  campYm = ym;
  const c = CAMPS[ym];
  const [y = 0, m = 1] = ym.split('-').map(Number);
  $('#campSub').textContent = `${cap(nomeMes(m - 1))} de ${y}`;
  $<HTMLInputElement>('#cName').value = c?.n ?? '';
  $<HTMLInputElement>('#cDesc').value = c?.s ?? '';
  $<HTMLInputElement>(`input[name=campColor][value=${c?.c ?? 'azul'}]`).checked = true;
  $('#cRemove').hidden = !c;
  campDlg.showModal();
}
$<HTMLFormElement>('#campForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!campYm) return;
  const cor = CORES_CAMPANHA.find(c => c === $<HTMLInputElement>('input[name=campColor]:checked').value) ?? 'azul';
  try {
    CAMPS = await api.saveCampaign(campYm, { n: $<HTMLInputElement>('#cName').value, s: $<HTMLInputElement>('#cDesc').value, c: cor });
    campDlg.close();
    render();
    toast('Campanha salva.');
  } catch (e) { falha(e); }
});
$('#cRemove').addEventListener('click', async () => {
  if (!campYm) return;
  try { CAMPS = await api.saveCampaign(campYm, null); campDlg.close(); render(); toast('Campanha removida.'); }
  catch (e) { falha(e); }
});

// =====================================================================
// NAVEGAÇÃO E INÍCIO
// =====================================================================
const step = (n: number) => { cur = fromIdx(Math.min(TOTAL - 1, Math.max(0, idx(cur) + n))); render(); };
$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
const setView = (v: typeof view) => {
  view = v;
  $('#vCal').setAttribute('aria-pressed', String(v === 'cal'));
  $('#vList').setAttribute('aria-pressed', String(v === 'list'));
  render();
};
$('#vCal').addEventListener('click', () => setView('cal'));
$('#vList').addEventListener('click', () => setView('list'));
$$<HTMLDialogElement>('dialog').forEach(d => {
  $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
});
function closeAll(): void { $$<HTMLDialogElement>('dialog[open]').forEach(d => d.close()); }
document.addEventListener('keydown', e => {
  const alvo = e.target as HTMLElement;
  if (document.querySelector('dialog[open]') || $('#appScreen').hidden || /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

void (async function init() {
  const t = new Date();
  let c: Mes = { y: t.getFullYear(), m: t.getMonth() };
  const mh = /^#(\d{4})-(\d{2})$/.exec(location.hash);
  if (mh) c = { y: Number(mh[1]), m: Number(mh[2]) - 1 };
  if (dentroDoPeriodo(c)) cur = c;
  ME = await api.me();
  if (ME) await enterApp(); else showLogin();
})();
