// =====================================================================
// TELA (front-end). Só conversa com o "servidor" através de `api`.
// =====================================================================
import './styles.css';
import { BANCO_NAO_CONFIGURADO, MODO_DEMO, api, isApiError, mensagemDoErro } from './api';
import { AtaInput, EventoInput, NovoUsuarioInput, TrocaSenhaInput, primeiraMensagem } from './domain/schemas';
import {
  CATEGORIAS, CORES_CAMPANHA, ESPACOS_DA_UNIDADE, NOME_ESPACO, NOME_UNIDADE, UNIDADES,
  type AnoMes, type Ata, type AtaDados, type Campanhas, type Categoria, type CorCampanha, type DataIso, type Escopo,
  type Evento, type EventoDados, type SolicitacaoView, type StatusSolicitacao, type Usuario,
} from './domain/types';
import { $, $$, html, raw, setHtml, type SafeHtml } from './ui/dom';
import {
  cap, diaDaSemana, fmtDate, fmtShort, fmtWhen, hojeKey, horaParaInput, iniciais,
  inputParaHora, key, minutos, nomeMes, parseKey,
} from './ui/format';

// ---------- configuração de exibição ----------
const CATS: Record<Categoria, { label: string; one: string; ord: number }> = {
  feriado: { label: 'Feriados', one: 'Feriado', ord: 0 },
  evento: { label: 'Eventos especiais', one: 'Evento especial', ord: 1 },
  aniv: { label: 'Aniversários e homenagens', one: 'Aniversário ou homenagem', ord: 2 },
  data: { label: 'Datas comemorativas', one: 'Data comemorativa', ord: 3 },
  culto: { label: 'Cultos', one: 'Culto', ord: 4 },
  reuniao: { label: 'Reuniões', one: 'Reunião', ord: 5 },
  ensaio: { label: 'Ensaios', one: 'Ensaio', ord: 6 },
};
/** Categorias de rotina: aparecem no dia, mas não pintam a barra de destaque. */
const ROTINA = new Set<Categoria>(['culto', 'reuniao', 'ensaio']);
const NOME_COR: Record<CorCampanha, string> = { azul: 'Azul', rosa: 'Rosa', amarelo: 'Amarelo', verde: 'Verde' };
const NOME_STATUS: Record<StatusSolicitacao, string> = { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' };

type Visao = 'mes' | 'semana' | 'dia' | 'ano';
/** Calendário (grade) ou Lista: vale para qualquer período. */
type Modo = 'cal' | 'lista';
/** Texto das setas de navegação em cada visão. */
const PASSO: Record<Visao, [string, string]> = {
  mes: ['Mês anterior', 'Próximo mês'],
  semana: ['Semana anterior', 'Próxima semana'], dia: ['Dia anterior', 'Próximo dia'], ano: ['Ano anterior', 'Próximo ano'],
};
const SEM_C = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const keyOf = (d: Date): DataIso => key(d.getFullYear(), d.getMonth(), d.getDate());
const somaDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inicioDaSemana = (d: Date) => somaDias(d, -d.getDay());
const color = (c: string) => `var(--${c})`;
/** Celular: o menu vira gaveta e tocar no dia seleciona em vez de abrir o diálogo. */
const isMobile = () => matchMedia('(max-width: 760px)').matches;
/** Preferências de tela salvas no navegador (tema, menu recolhido, modo). */
const lerPref = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarPref = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
/** Nome curto para as etiquetas pequenas do celular. */
const curto = (n: string) => n
  .replace(/^Culto (de |da |do |das |dos )?/i, '')
  .replace(/^Confraternização/i, 'Confrat.')
  .replace(/^Apresentação (de |do |da )?/i, 'Apres. ')
  .replace(/^Reunião (de |do |da )?/i, 'Reun. ')
  .replace(/^Curso /i, '')
  .replace(/^Ensaio (de |do |da )?/i, 'Ensaio ')
  .trim() || n;

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
let ATAS: Ata[] = [];
let IDX: Record<DataIso, ItemDia[]> = {};
/** Data em foco: define o dia, a semana, o mês ou o ano mostrado. */
let foco: Date = parseKey(hojeKey());
let view: Visao = 'mes';
let modo: Modo = lerPref('mahanaim-modo') === 'lista' ? 'lista' : 'cal';
/** Texto da busca do topo (vazio = sem busca). */
let busca = '';
const active = new Set<Categoria>(CATEGORIAS);

const isAdmin = () => ME?.perfil === 'admin';

// ---------- apresentação ----------
/** "Santo André · Sala Betel · No culto" (só o que estiver preenchido). */
const onde = (e: EventoDados): string[] =>
  [e.un && NOME_UNIDADE[e.un], e.esp && NOME_ESPACO[e.esp], e.l].filter((x): x is string => !!x);
const sub = (e: ItemDia) => {
  const partes = onde(e);
  if (e.total) partes.push(`${partes.length ? 'dia' : 'Dia'} ${e.dia} de ${e.total}`);
  return partes.join(' · ');
};
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
  [EVENTS, REQS, CAMPS, ATAS] = await Promise.all([api.listEvents(), api.listRequests(), api.listCampaigns(), api.listMinutes()]);
  buildIndex();
  // Admin: pedidos esperando aprovação. User: os próprios pedidos ainda pendentes.
  const pend = REQS.filter(r => r.status === 'pendente').length;
  const rc = $('#reqCount');
  rc.hidden = !pend;
  rc.textContent = String(pend);
  $('#pip').hidden = !pend;
  $('#bell').setAttribute('aria-label', pend ? `Solicitações: ${pend} pendente${pend === 1 ? '' : 's'}` : 'Solicitações');
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
  $('#pwdScreen').hidden = true;
  $('#loginScreen').hidden = false;
  document.title = 'Mahanaim · Gestão da liderança';
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
$('#lgForgot').addEventListener('click', () => toast('Recuperação de senha por e-mail ainda não está disponível. Fale com a liderança.'));

async function enterApp(): Promise<void> {
  if (!ME) return showLogin();
  $('#loginScreen').hidden = true;
  // Primeiro acesso: troca obrigatória da senha provisória antes de liberar o app
  if (ME.senhaProvisoria) return showPasswordChange();
  $('#pwdScreen').hidden = true;
  $('#appScreen').hidden = false;
  const adm = isAdmin();
  $('#avatar').textContent = $('#meAv').textContent = iniciais(ME.nome);
  $('#whoName').textContent = ME.nome;
  $('#meName').textContent = ME.nome;
  $('#meEmail').textContent = ME.email;
  $('#meRole').textContent = adm ? 'Administrador' : 'Visualização';
  $('#navUsers').hidden = !adm;
  $('#navReqLbl').textContent = adm ? 'Solicitações' : 'Minhas solicitações';
  $('#aNew').hidden = !adm;
  $('#reqNew').hidden = adm;
  $('#mReset').hidden = !adm || !MODO_DEMO;
  const longo = adm ? 'Novo evento' : 'Solicitar evento';
  setHtml($('#btnNew'), html`<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="lbl-long">${longo}</span>`);
  $('#btnNew').setAttribute('aria-label', longo);
  buildLegend();
  try { await loadData(); } catch (e) { return falha(e); }
  render();
  aplicarRota();
}

// =====================================================================
// PRIMEIRO ACESSO: troca da senha provisória
// =====================================================================
const pw = {
  form: $<HTMLFormElement>('#pwdForm'),
  nova: $<HTMLInputElement>('#pwdNew'),
  conf: $<HTMLInputElement>('#pwdConfirm'),
  err: $('#pwdErr'),
  submit: $<HTMLButtonElement>('#pwdSubmit'),
};
function showPasswordChange(): void {
  closeAll();
  $('#appScreen').hidden = true;
  $('#loginScreen').hidden = true;
  $('#pwdScreen').hidden = false;
  $('#pwdName').textContent = ME?.nome.split(' ')[0] ?? '';
  pw.form.reset();
  pw.err.hidden = true;
  setTimeout(() => pw.nova.focus(), 0);
}
pw.form.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (pw.submit.disabled) return;
  const mostrarErro = (m: string) => { pw.err.textContent = m; pw.err.hidden = false; };
  pw.err.hidden = true;
  const v = TrocaSenhaInput.safeParse({ senha: pw.nova.value, confirmacao: pw.conf.value });
  if (!v.success) return mostrarErro(primeiraMensagem(v.error));
  pw.submit.disabled = true;
  try {
    ME = await api.changePassword(v.data);
    pw.form.reset();
    await enterApp();
    toast('Senha criada. Bem-vindo!');
  } catch (e) {
    mostrarErro(mensagemDoErro(e));
    if (isApiError(e) && e.codigo === 'NAO_AUTENTICADO') showLogin();
  } finally {
    pw.submit.disabled = false;
  }
});
$('#pwdLogout').addEventListener('click', async () => { await api.logout(); showLogin(); });

// =====================================================================
// ROTAS: "/" = calendário · "/solicitacoes" · "/atas" = atas de reunião · "/users" = usuários (só admin)
// =====================================================================
type Pagina = 'cal' | 'req' | 'atas' | 'users';
const CAMINHO: Record<Pagina, string> = { cal: '/', req: '/solicitacoes', atas: '/atas', users: '/users' };
function paginaAtual(): Pagina {
  const p = location.pathname.replace(/\/+$/, '');
  return p === '/users' ? 'users' : p === '/atas' ? 'atas' : p === '/solicitacoes' ? 'req' : 'cal';
}

function navegar(caminho: string): void {
  if (location.pathname !== caminho) history.pushState(null, '', caminho);
  aplicarRota();
}
function aplicarRota(): void {
  if (!ME || $('#appScreen').hidden) return;
  let pagina = paginaAtual();
  if (pagina === 'users' && !isAdmin()) {
    history.replaceState(null, '', '/');
    pagina = 'cal';
    toast('A tela de usuários é só para administradores.', true);
  }
  closeAll();
  fecharGaveta();
  $('#calPage').hidden = pagina !== 'cal';
  $('#reqPage').hidden = pagina !== 'req';
  $('#usersPage').hidden = pagina !== 'users';
  $('#atasPage').hidden = pagina !== 'atas';
  $('#btnNew').hidden = pagina !== 'cal';
  $('#appScreen').classList.toggle('sem-painel', pagina !== 'cal');
  $$<HTMLAnchorElement>('#nav a').forEach(a => {
    if (a.dataset['pg'] === pagina) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const titulos: Record<Pagina, string> = {
    cal: '', req: (isAdmin() ? 'Solicitações' : 'Minhas solicitações') + ' · ', users: 'Usuários · ', atas: 'Atas de reunião · ',
  };
  document.title = titulos[pagina] + 'Mahanaim · Gestão da liderança';
  $('.content').scrollTop = 0;
  if (pagina === 'users') void renderUsers();
  if (pagina === 'atas') renderAtas();
  if (pagina === 'req') renderRequests();
}
window.addEventListener('popstate', aplicarRota);
$$<HTMLAnchorElement>('#nav a, #bell').forEach(a => a.addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // abrir em nova aba continua funcionando
  e.preventDefault();
  navegar(a.getAttribute('href') ?? '/');
}));

// =====================================================================
// MENU LATERAL, TEMA E PAINEL
// =====================================================================
const shell = $('#appScreen');
const side = $('#side');

/** Recolhe/expande o menu (computador). No celular o menu é uma gaveta. */
function aplicarMenu(recolhido: boolean): void {
  side.classList.toggle('collapsed', recolhido);
  const b = $('#collapse');
  b.setAttribute('aria-expanded', String(!recolhido));
  b.title = recolhido ? 'Expandir menu' : 'Recolher menu';
  $('.lbl', b).textContent = b.title;
}
{
  const pref = lerPref('mahanaim-menu');
  aplicarMenu(pref ? pref === 'recolhido' : matchMedia('(max-width: 1100px)').matches);
}
$('#collapse').addEventListener('click', () => {
  const recolher = !side.classList.contains('collapsed');
  aplicarMenu(recolher);
  gravarPref('mahanaim-menu', recolher ? 'recolhido' : 'aberto');
});
function fecharGaveta(): void { shell.classList.remove('gaveta', 'painel-aberto'); }
$('#burger').addEventListener('click', () => shell.classList.add('gaveta'));
$('#openPanel').addEventListener('click', () => shell.classList.add('painel-aberto'));
$('#closePanel').addEventListener('click', () => shell.classList.remove('painel-aberto'));
$('#scrim').addEventListener('click', fecharGaveta);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (shell.classList.contains('gaveta') || shell.classList.contains('painel-aberto'))) fecharGaveta();
});

// ---------- tema: claro ou escuro (sem escolha salva, abre no claro) ----------
type Tema = 'claro' | 'escuro';
let tema: Tema = lerPref('mahanaim-tema') === 'escuro' ? 'escuro' : 'claro';
function aplicarTema(): void {
  document.documentElement.dataset['theme'] = tema === 'escuro' ? 'dark' : 'light';
  $$<HTMLButtonElement>('#theme button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset['tema'] === tema)));
}
$$<HTMLButtonElement>('#theme button').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset['tema'];
  tema = t === 'escuro' ? 'escuro' : 'claro';
  gravarPref('mahanaim-tema', tema);
  aplicarTema();
}));
aplicarTema();

$('#mLogout').addEventListener('click', async () => {
  await api.logout();
  history.replaceState(null, '', '/');
  showLogin();
  toast('Você saiu.');
});
$('#mReset').addEventListener('click', async () => {
  const ok = await ask({ title: 'Restaurar dados de exemplo?', msg: 'Todas as alterações feitas neste navegador serão descartadas. Isso existe só no protótipo.', ok: 'Restaurar', danger: true });
  if (!ok) return;
  await api.resetDemo();
  ME = await api.me();
  if (!ME) return showLogin();
  await refresh();
  toast('Dados de exemplo restaurados.');
});
$('#btnNew').addEventListener('click', () => openForm(isAdmin() ? { mode: 'create', ev: { data: defaultDate() } } : { mode: 'request', ev: { data: defaultDate() } }));
$('#reqNew').addEventListener('click', () => openForm({ mode: 'request', ev: { data: defaultDate() } }));

function defaultDate(): DataIso {
  if (view === 'dia' || view === 'semana') return keyOf(foco);
  const t = new Date(), y = foco.getFullYear(), m = foco.getMonth();
  return t.getFullYear() === y && t.getMonth() === m ? key(y, m, t.getDate()) : key(y, m, 1);
}

// =====================================================================
// CALENDÁRIO
// =====================================================================
/** Leva o calendário até a data (mantém a visão atual). */
function irPara(k: DataIso): void { foco = parseKey(k); render(); }

function tituloPeriodo(): string {
  const d = foco, y = d.getFullYear();
  switch (view) {
    case 'ano': return String(y);
    case 'dia': return `${(diaDaSemana(keyOf(d))).replace('-feira', '')}, ${d.getDate()} de ${nomeMes(d.getMonth())} de ${y}`;
    case 'semana': {
      const a = inicioDaSemana(d), b = somaDias(a, 6);
      const curto = (x: Date) => nomeMes(x.getMonth()).slice(0, 3);
      if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${curto(a)} ${a.getFullYear()} – ${b.getDate()} ${curto(b)} ${b.getFullYear()}`;
      if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${curto(a)} – ${b.getDate()} ${curto(b)} de ${y}`;
      return `${a.getDate()} – ${b.getDate()} de ${nomeMes(b.getMonth())} de ${b.getFullYear()}`;
    }
    default: return `${nomeMes(d.getMonth())} de ${y}`;
  }
}

/** Filtros por tipo de evento (no painel). Desmarcar esconde o tipo em todas as visões. */
function buildLegend(): void {
  const lgd = $('#legend');
  lgd.replaceChildren();
  CATEGORIAS.forEach(c => {
    const l = document.createElement('label');
    l.style.setProperty('--c', color(c));
    setHtml(l, html`<input type="checkbox" data-cat="${c}" ${active.has(c) ? raw('checked') : ''}>${CATS[c].label}<span class="n" data-n="${c}"></span>`);
    $<HTMLInputElement>('input', l).addEventListener('change', ev => {
      const on = (ev.currentTarget as HTMLInputElement).checked;
      if (on) active.add(c); else active.delete(c);
      render();
    });
    lgd.appendChild(l);
  });
}
/** Quantos itens de cada tipo há no mês em foco (contando os escondidos). */
function contarLegenda(): void {
  const y = foco.getFullYear(), m = foco.getMonth(), dim = new Date(y, m + 1, 0).getDate();
  const n: Partial<Record<Categoria, number>> = {};
  for (let d = 1; d <= dim; d++) (IDX[key(y, m, d)] ?? []).forEach(e => { n[e.c] = (n[e.c] ?? 0) + 1; });
  CATEGORIAS.forEach(c => { $(`[data-n="${c}"]`).textContent = String(n[c] ?? 0); });
  $('#legendCount').textContent = `${active.size} de ${CATEGORIAS.length}`;
}

/** Minicalendário do painel: mês em foco, com pontinhos dos tipos de cada dia. */
function renderMini(): void {
  const y = foco.getFullYear(), m = foco.getMonth(), hoje = hojeKey(), fk = keyOf(foco);
  $('#miniTitle').textContent = cap(`${nomeMes(m)} ${y}`);
  const ini = inicioDaSemana(new Date(y, m, 1));
  const semanas = Math.ceil((new Date(y, m, 1).getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  const dias: SafeHtml[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const d = somaDias(ini, i), k = keyOf(d);
    const tipos = [...new Set(eventsOf(k).map(e => e.c))].slice(0, 3);
    const cls = [d.getMonth() !== m ? 'out' : '', k === hoje ? 'today' : '', k === fk && view !== 'mes' && view !== 'ano' ? 'foco' : ''].filter(Boolean).join(' ');
    dias.push(html`<button type="button" class="${cls}" data-k="${k}" aria-label="${d.getDate()} de ${nomeMes(d.getMonth())}">${d.getDate()}${tipos.length ? html`<span class="dots">${tipos.map(c => html`<i style="--c:${color(c)}"></i>`)}</span>` : ''}</button>`);
  }
  const box = $('#miniGrid');
  setHtml(box, html`${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(w => html`<span class="wd" aria-hidden="true">${w}</span>`)}${dias}`);
  $$<HTMLButtonElement>('button', box).forEach(b => b.addEventListener('click', () => {
    foco = parseKey(b.dataset['k'] ?? hojeKey());
    if (!isMobile() && (view === 'mes' || view === 'ano')) view = 'dia';
    shell.classList.remove('painel-aberto');
    render();
  }));
}
$('#miniPrev').addEventListener('click', () => { foco = new Date(foco.getFullYear(), foco.getMonth() - 1, 1); render(); });
$('#miniNext').addEventListener('click', () => { foco = new Date(foco.getFullYear(), foco.getMonth() + 1, 1); render(); });

/** Período mostrado pela visão atual (usado pelo modo Lista). */
function intervalo(): [Date, Date] {
  const y = foco.getFullYear(), m = foco.getMonth();
  switch (view) {
    case 'dia': return [foco, foco];
    case 'semana': { const a = inicioDaSemana(foco); return [a, somaDias(a, 6)]; }
    case 'ano': return [new Date(y, 0, 1), new Date(y, 11, 31)];
    default: return [new Date(y, m, 1), new Date(y, m + 1, 0)];
  }
}

function render(): void {
  $('#title').textContent = tituloPeriodo();
  const [ant, prox] = PASSO[view];
  $('#prev').setAttribute('aria-label', ant);
  $('#next').setAttribute('aria-label', prox);
  $$<HTMLButtonElement>('#views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset['v'] === view)));
  $$<HTMLButtonElement>('#modo button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset['m'] === modo)));
  renderCampaign();
  renderMini();
  contarLegenda();
  const info = $('#buscaInfo');
  const lista = modo === 'lista' || !!busca;
  const telas: Record<Visao, string> = { mes: '#calView', semana: '#weekView', dia: '#dayView', ano: '#yearView' };
  (Object.keys(telas) as Visao[]).forEach(v => { $(telas[v]).hidden = lista || v !== view; });
  $('#listView').hidden = !lista;
  info.hidden = !busca;
  if (busca) return renderBusca();
  if (lista) return renderList(...intervalo());
  ({ mes: renderGrid, semana: renderWeek, dia: renderDay, ano: renderYear })[view]();
}

function renderCampaign(): void {
  const ym: AnoMes = keyOf(foco).slice(0, 7), camp = CAMPS[ym];
  const old = $('#campaign');
  const box = document.createElement('div'); // recria para limpar eventos antigos
  box.id = 'campaign';
  old.replaceWith(box);
  if (view === 'ano') return; // campanha é do mês; no ano não faz sentido
  if (camp) {
    box.className = 'campaign';
    box.style.setProperty('--c', color(camp.c));
    setHtml(box, html`<small>Campanha do mês</small><b>${camp.n}</b><p>${camp.s}</p>${isAdmin() ? raw('<button type="button" class="edit">Editar campanha</button>') : ''}`);
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

/** Etiqueta do evento na grade: barra na cor do tipo + horário + título (no celular, só o nome curto). */
const chip = (e: ItemDia): SafeHtml => html`<div class="chip${e.pend ? ' pend' : ''}" style="--c:${color(e.c)}">${e.t ? html`<span class="h">${e.t}</span>` : ''}<span class="tt">${e.n}</span><span class="ts" aria-hidden="true">${curto(e.n)}</span></div>`;

function renderGrid(): void {
  const y = foco.getFullYear(), m = foco.getMonth(), grid = $('#grid'), hoje = hojeKey(), fk = keyOf(foco);
  grid.replaceChildren();
  const ini = inicioDaSemana(new Date(y, m, 1));
  const semanas = Math.ceil((new Date(y, m, 1).getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  for (let i = 0; i < semanas * 7; i++) {
    const dt = somaDias(ini, i), k = keyOf(dt), list = eventsOf(k), d = dt.getDate();
    const cell = document.createElement('div');
    cell.className = 'day' + (dt.getMonth() !== m ? ' out' : '') + (k === hoje ? ' today' : '') + (k === fk ? ' sel' : '');
    if (list.some(e => e.c === 'feriado' && !e.pend)) cell.classList.add('hol');
    setHtml(cell, html`
      <span class="num">${d}</span><span class="add-hint" aria-hidden="true">+</span>
      ${list.slice(0, 3).map(chip)}
      ${list.length > 3 ? html`<span class="more">+${list.length - 3}</span>` : ''}`);
    cell.title = list.map(e => (e.t ? e.t + ' ' : '') + label(e) + (e.pend ? ' (pendente)' : '')).join('\n');
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${d} de ${nomeMes(dt.getMonth())}, ${qtd(list.length)}`);
    // Computador: abre o diálogo do dia. Celular: seleciona o dia e mostra a agenda embaixo da grade.
    const abrir = () => {
      if (!isMobile()) return openDay(k);
      foco = dt;
      render();
      $('#agenda').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    cell.addEventListener('click', abrir);
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    grid.appendChild(cell);
  }
  // Agenda do dia selecionado (aparece só no celular, pelo CSS)
  const ag = $('#agenda');
  setHtml(ag, html`<h2>${k2titulo(fk)}</h2><div class="dview"></div>`);
  preencherDia($('.dview', ag), fk);
}
const k2titulo = (k: DataIso) => `${k === hojeKey() ? 'Hoje · ' : ''}${diaDaSemana(k)}, ${parseKey(k).getDate()} de ${nomeMes(parseKey(k).getMonth())}`;

/** Lista de eventos agrupada por dia, de `de` até `ate`. */
function renderList(de: Date, ate: Date): void {
  const box = $('#listView'), dias: [DataIso, ItemDia[]][] = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) { const k = keyOf(d), l = eventsOf(k); if (l.length) dias.push([k, l]); }
  desenharLista(box, dias, 'Nenhum item neste período com os filtros escolhidos.');
}
function desenharLista(box: HTMLElement, dias: [DataIso, ItemDia[]][], vazio: string): void {
  if (!dias.length) { setHtml(box, html`<p class="empty">${vazio}</p>`); return; }
  const hoje = hojeKey();
  setHtml(box, html`${dias.map(([k, list]) => html`<div class="grp">
    <h3 class="${k === hoje ? 'hoje' : ''}">${k2titulo(k)}${parseKey(k).getFullYear() !== new Date().getFullYear() ? ` de ${parseKey(k).getFullYear()}` : ''}</h3>
    ${list.map(e => html`<button type="button" class="row${e.pend ? ' pend' : ''}" data-k="${k}">
      ${dot(e.c, e.pend)}<span class="t">${e.t ?? '—'}</span>
      <span class="n">${e.n}${sub(e) ? html`<span class="l">${sub(e)}</span>` : ''}</span>
      ${e.pend ? raw('<span class="badge pendente">Pendente</span>') : html`<span class="badge">${CATS[e.c].one}</span>`}
    </button>`)}
  </div>`)}`);
  $$<HTMLButtonElement>('.row', box).forEach(b => b.addEventListener('click', () => openDay(b.dataset['k'] ?? hojeKey())));
}

/** Resultado da busca do topo: todos os dias com itens que batem com o texto (título ou local). */
function renderBusca(): void {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  const dias = (Object.keys(IDX) as DataIso[]).sort()
    .map((k): [DataIso, ItemDia[]] => [k, eventsOf(k).filter(e => {
      const t = normalizar([e.n, ...onde(e)].join(' '));
      return termos.every(x => t.includes(x));
    })])
    .filter(([, l]) => l.length);
  const hoje = hojeKey();
  // Próximos primeiro; os que já passaram vão para o fim
  const ordenados = [...dias.filter(([k]) => k >= hoje), ...dias.filter(([k]) => k < hoje).reverse()];
  const n = ordenados.reduce((s, [, l]) => s + l.length, 0);
  $('#buscaInfo').textContent = n ? `${qtd(n)} para “${busca}”. Próximos primeiro.` : '';
  desenharLista($('#listView'), ordenados, `Nada encontrado para “${busca}”.`);
}

/** Torna o elemento um botão que abre o diálogo do dia (clique, Enter ou espaço). */
function abreDiaAo(el: HTMLElement, k: DataIso, rotulo: string): void {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', rotulo);
  el.addEventListener('click', () => openDay(k));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(k); } });
}
const qtd = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;

function renderWeek(): void {
  const box = $('#weekView'), a = inicioDaSemana(foco), hoje = hojeKey();
  box.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const dt = somaDias(a, i), k = keyOf(dt), list = eventsOf(k);
    const col = document.createElement('div');
    col.className = 'wday' + (k === hoje ? ' today' : '');
    if (list.some(e => e.c === 'feriado' && !e.pend)) col.classList.add('hol');
    setHtml(col, html`
      <div class="h"><small>${SEM_C[i]}</small><b>${dt.getDate()}</b></div>
      ${list.length
        ? html`<ul class="wev">${list.map(e => html`
            <li class="${e.pend ? 'pend' : ''}" style="--c:${color(e.c)}"><span class="t">${e.t ?? 'Dia todo'}</span>${label(e)}</li>`)}</ul>`
        : html`<span class="nada">Livre</span>`}
    `);
    abreDiaAo(col, k, `${diaDaSemana(k)}, ${dt.getDate()} de ${nomeMes(dt.getMonth())}, ${qtd(list.length)}`);
    box.appendChild(col);
  }
}

/** Itens de um dia em cartões + botão de adicionar/solicitar (visão Dia e agenda do celular). */
function preencherDia(box: HTMLElement, k: DataIso): void {
  const list = eventsOf(k), adm = isAdmin();
  box.replaceChildren();
  list.forEach(e => {
    const row = document.createElement('div');
    row.className = 'slot' + (e.pend ? ' pend' : '');
    row.style.setProperty('--c', color(e.c));
    const kind = e.pend ? `Aguardando aprovação · enviado por ${e.autor ?? '—'}` : CATS[e.c].one + (e.serie ? ' · recorrente' : '');
    setHtml(row, html`<span class="t">${e.t ?? 'Dia todo'}</span>
      <span class="n">${e.n}${sub(e) ? html`<span class="l">${sub(e)}</span>` : ''}<span class="k">${kind}</span></span>`);
    abreDiaAo(row, k, `${e.t ? e.t + ', ' : ''}${e.n}`);
    box.appendChild(row);
  });
  if (!list.length) setHtml(box, html`<p class="empty">Nada marcado neste dia.</p>`);
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn primary add-dia';
  add.textContent = adm ? '+ Adicionar neste dia' : '+ Solicitar evento neste dia';
  add.addEventListener('click', () => openForm(adm ? { mode: 'create', ev: { data: k } } : { mode: 'request', ev: { data: k } }));
  box.appendChild(add);
}
function renderDay(): void { preencherDia($('#dayView'), keyOf(foco)); }

function renderYear(): void {
  const box = $('#yearView'), y = foco.getFullYear(), hoje = hojeKey();
  box.replaceChildren();
  for (let m = 0; m < 12; m++) {
    const lead = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
    const dias: SafeHtml[] = [];
    for (let d = 1; d <= dim; d++) {
      const k = key(y, m, d), list = eventsOf(k);
      const cls = [
        k === hoje ? 'today' : '',
        list.some(e => e.c === 'feriado' && !e.pend) ? 'hol' : '',
        list.some(e => !ROTINA.has(e.c) && e.c !== 'feriado' && !e.pend) ? 'esp' : '',
      ].filter(Boolean).join(' ');
      dias.push(html`<span class="${cls}">${d}</span>`);
    }
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mini' + (m === new Date().getMonth() && y === new Date().getFullYear() ? ' cur' : '');
    card.setAttribute('aria-label', `Abrir ${nomeMes(m)} de ${y}`);
    setHtml(card, html`<h3>${cap(nomeMes(m))}</h3>
      <div class="g" aria-hidden="true">${SEM_C.map(s => html`<span class="w">${s.charAt(0)}</span>`)}${Array.from({ length: lead }, () => raw('<span></span>'))}${dias}</div>`);
    card.addEventListener('click', () => { foco = new Date(y, m, 1); view = 'mes'; render(); });
    box.appendChild(card);
  }
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
        else {
          const temAta = !!(e.id && ataDoEvento(e.id));
          const ata = temAta || (adm && e.c === 'reuniao')
            ? html`<button class="iconbtn sm ata" data-ata="${i}" aria-label="${temAta ? 'Ver ata de' : 'Escrever ata de'} ${e.n}" title="${temAta ? 'Ver ata' : 'Escrever ata'}">📝</button>`
            : '';
          acts = adm
            ? html`${ata}<button class="iconbtn sm" data-edit="${i}" aria-label="Editar ${e.n}" title="Editar">✎</button><button class="iconbtn sm" data-del="${i}" aria-label="Excluir ${e.n}" title="Excluir">🗑</button>`
            : html`${ata}`;
        }
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
  $$('[data-ata]', ul).forEach(b => b.addEventListener('click', () => {
    const e = evento(item(b, 'ata')); if (!e) return;
    const a = ataDoEvento(e.id);
    if (a) openAta(a);
    else if (isAdmin()) openAtaForm({ titulo: e.n, data: e.data, eventoId: e.id });
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
  un: $<HTMLSelectElement>('#fUn'),
  espWrap: $('#fEspWrap'),
  esp: $<HTMLSelectElement>('#fEsp'),
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
setHtml(f.un, html`<option value="">Não definido</option>${UNIDADES.map(u => html`<option value="${u}">${NOME_UNIDADE[u]}</option>`)}`);
/** Mostra só os espaços do local escolhido; mantém o atual se ele existir lá. */
function preencherEspacos(atual = f.esp.value): void {
  const un = UNIDADES.find(u => u === f.un.value);
  const lista = un ? ESPACOS_DA_UNIDADE[un] : [];
  setHtml(f.esp, html`<option value="">Não definido</option>${lista.map(s => html`<option value="${s}">${NOME_ESPACO[s]}</option>`)}`);
  f.esp.value = lista.some(s => s === atual) ? atual : '';
  f.espWrap.hidden = !lista.length;
}
f.un.addEventListener('change', () => preencherEspacos());
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
  f.un.value = e.un ?? '';
  preencherEspacos(e.esp ?? '');
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
    un: f.un.value, esp: f.espWrap.hidden ? '' : f.esp.value, l: f.loc.value, fim: f.multi.checked ? f.end.value : '',
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
      irPara(dados.data);
    }
    reopenDay();
    if (!$('#reqPage').hidden) renderRequests();
  } catch (err) {
    mostrarErro(mensagemDoErro(err));
    if (isApiError(err) && err.codigo === 'NAO_AUTENTICADO') showLogin();
  }
  f.submit.disabled = false;
});

// =====================================================================
// CONFIRMAÇÃO GENÉRICA
// =====================================================================
interface AskOpts {
  title: string; msg?: string; ok: string; danger?: boolean; scope?: boolean; text?: string;
  /** Exige digitar exatamente este valor para liberar o botão (ex.: o e-mail de quem será excluído). */
  confirm?: { label: string; valor: string };
}
interface AskResult { scope: Escopo; text: string }

function ask(o: AskOpts): Promise<AskResult | null> {
  return new Promise(resolve => {
    const dlg = $<HTMLDialogElement>('#askDlg');
    const okBtn = $<HTMLButtonElement>('#askOk');
    const txt = $<HTMLTextAreaElement>('#askText');
    const conf = $<HTMLInputElement>('#askConfirm');
    const confere = () => !o.confirm || conf.value.trim().toLowerCase() === o.confirm.valor.toLowerCase();
    $('#askTitle').textContent = o.title;
    $('#askMsg').textContent = o.msg ?? '';
    okBtn.textContent = o.ok;
    okBtn.className = 'btn ' + (o.danger ? 'danger' : 'primary');
    $('#askScope').hidden = !o.scope;
    $<HTMLInputElement>('input[name=askScope][value=um]').checked = true;
    $('#askTextWrap').hidden = !o.text;
    txt.value = '';
    if (o.text) $('#askTextLabel').textContent = o.text;
    $('#askConfirmWrap').hidden = !o.confirm;
    conf.value = '';
    if (o.confirm) $('#askConfirmLabel').textContent = o.confirm.label;
    okBtn.disabled = !confere();
    conf.oninput = () => { okBtn.disabled = !confere(); };
    $('#askBody').hidden = !o.scope && !o.text && !o.confirm;
    let done = false;
    const finish = (v: AskResult | null) => { if (done) return; done = true; dlg.close(); resolve(v); };
    $<HTMLFormElement>('#askForm').onsubmit = e => { e.preventDefault(); if (confere()) finish({ scope: radioEscopo('askScope'), text: txt.value }); };
    $<HTMLButtonElement>('#askCancel').onclick = () => finish(null);
    // O evento "close" chega depois (assíncrono): se o diálogo já foi reaberto por
    // outra pergunta (ex.: 2º passo da exclusão), ele não pode cancelar a nova.
    dlg.onclose = () => { if (!dlg.open) finish(null); };
    dlg.showModal();
    setTimeout(() => (o.confirm ? conf : o.text ? txt : okBtn).focus(), 0);
  });
}

// =====================================================================
// SOLICITAÇÕES — tela própria em /solicitacoes
// =====================================================================
let reqTab: StatusSolicitacao = 'pendente';

function openRequests(tab: StatusSolicitacao = 'pendente'): void {
  reqTab = tab;
  if (paginaAtual() === 'req') renderRequests(); else navegar(CAMINHO.req);
}

function renderRequests(): void {
  $('#reqTitle').textContent = isAdmin() ? 'Solicitações' : 'Minhas solicitações';
  $('#reqSub').textContent = isAdmin()
    ? 'Tudo o que entra no calendário a pedido dos membros passa por aqui.'
    : 'Acompanhe o que você pediu para a liderança.';
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
      <div class="head"><div><h3>${dot(e.c)}${e.n}</h3><div class="meta">${[quando, ...onde(e)].join(' · ')} · ${CATS[e.c].one}</div></div><span class="badge ${r.status}">${NOME_STATUS[r.status]}</span></div>
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
    navegar(CAMINHO.cal);
    irPara(r.evento.data);
    openDay(r.evento.data);
  }));
}

// =====================================================================
// USUÁRIOS (admin) — tela própria em /users
// =====================================================================
let USERS: Usuario[] = [];

async function renderUsers(): Promise<void> {
  const box = $('#usersList');
  try { USERS = await api.listUsers(); } catch (e) { falha(e); return; }
  const aguardando = USERS.filter(u => u.senhaProvisoria).length;
  $('#usersSub').textContent = `${USERS.length} ${USERS.length === 1 ? 'usuário' : 'usuários'}`
    + (aguardando ? ` · ${aguardando} aguardando o primeiro acesso` : '')
    + '. Admin cria, edita e aprova eventos. User vê o calendário e envia solicitações.';
  if (!USERS.length) { setHtml(box, html`<tr><td colspan="5" class="empty">Nenhum usuário cadastrado.</td></tr>`); return; }
  setHtml(box, html`${USERS.map(u => {
    const eu = u.id === ME?.id;
    return html`<tr class="${u.ativo ? '' : 'off'}">
      <td class="nome">${u.nome}${eu ? raw(' <span class="badge">você</span>') : ''}${u.ativo ? '' : raw(' <span class="badge">desativado</span>')}</td>
      <td class="mail">${u.email}</td>
      <td data-label="Senha"><span class="senha"><span class="mask" aria-label="Senha oculta">••••••••</span>${u.senhaProvisoria
        ? raw('<span class="badge pendente" title="A senha provisória ainda não foi trocada">Aguardando 1º acesso</span>')
        : raw('<span class="badge aprovada" title="A pessoa já criou a própria senha">Já acessou</span>')}</span></td>
      <td data-label="Perfil"><select data-role="${u.id}" aria-label="Perfil de ${u.nome}" ${eu ? raw('disabled') : ''}>
        <option value="user" ${u.perfil === 'user' ? raw('selected') : ''}>User</option>
        <option value="admin" ${u.perfil === 'admin' ? raw('selected') : ''}>Admin</option>
      </select></td>
      <td><div class="acts">
        <button class="btn sm" data-toggle="${u.id}" ${eu ? raw('disabled') : ''}>${u.ativo ? 'Desativar' : 'Reativar'}</button>
        <button class="btn sm danger" data-del="${u.id}" aria-label="Excluir ${u.nome}" ${eu ? raw('disabled title="Você não pode excluir o seu próprio acesso"') : ''}>Excluir</button>
      </div></td>
    </tr>`;
  })}`);
  const porId = (v: string | undefined) => USERS.find(x => x.id === v);
  $$<HTMLSelectElement>('[data-role]', box).forEach(s => s.addEventListener('change', async () => {
    const perfil = s.value === 'admin' ? 'admin' : 'user';
    try { await api.updateUser({ id: s.dataset['role'] ?? '', perfil }); toast('Perfil atualizado.'); } catch (e) { falha(e); }
    await renderUsers();
  }));
  $$<HTMLButtonElement>('[data-toggle]', box).forEach(b => b.addEventListener('click', async () => {
    const u = porId(b.dataset['toggle']); if (!u) return;
    b.disabled = true;
    try { await api.updateUser({ id: u.id, ativo: !u.ativo }); toast(u.ativo ? 'Acesso desativado.' : 'Acesso reativado.'); } catch (e) { falha(e); }
    await renderUsers();
  }));
  $$<HTMLButtonElement>('[data-del]', box).forEach(b => b.addEventListener('click', () => {
    const u = porId(b.dataset['del']); if (u) void deleteUser(u);
  }));
}

/** Exclusão com dupla validação: confirma e depois exige digitar o e-mail. */
async function deleteUser(u: Usuario): Promise<void> {
  const passo1 = await ask({
    title: `Excluir ${u.nome}?`,
    msg: `${u.email} perde o acesso de vez e as solicitações enviadas por essa pessoa são apagadas. Eventos já publicados continuam no calendário. Se a ideia é só bloquear por um tempo, use "Desativar".`,
    ok: 'Continuar', danger: true,
  });
  if (!passo1) return;
  const passo2 = await ask({
    title: 'Confirme a exclusão',
    msg: 'Esta ação não pode ser desfeita.',
    ok: 'Excluir definitivamente', danger: true,
    confirm: { label: `Digite o e-mail ${u.email} para confirmar`, valor: u.email },
  });
  if (!passo2) return;
  try {
    await api.deleteUser(u.id);
    toast(`Acesso de ${u.nome} excluído.`);
  } catch (e) { falha(e); }
  await renderUsers();
  void refresh(); // pedidos da pessoa saem da fila e do calendário
}

// ---------- popup de criação ----------
const userDlg = $<HTMLDialogElement>('#userDlg');
const uf = {
  form: $<HTMLFormElement>('#userForm'),
  name: $<HTMLInputElement>('#uName'),
  email: $<HTMLInputElement>('#uEmail'),
  pass: $<HTMLInputElement>('#uPass'),
  role: $<HTMLSelectElement>('#uRole'),
  err: $('#uErr'),
  submit: $<HTMLButtonElement>('#uSubmit'),
};

/** Senha provisória aleatória: 10 caracteres sem os confusos (0/O, 1/l/I), com letra e número. */
function gerarSenha(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', numeros = '23456789', todos = letras + numeros;
  const r = crypto.getRandomValues(new Uint32Array(10));
  const c = Array.from(r, (n, i) => (i === 0 ? letras : i === 1 ? numeros : todos)[n % (i === 0 ? letras.length : i === 1 ? numeros.length : todos.length)]);
  // embaralha para a letra e o número não ficarem sempre no começo
  const m = crypto.getRandomValues(new Uint32Array(c.length));
  for (let i = c.length - 1; i > 0; i--) { const j = (m[i] ?? 0) % (i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return c.join('');
}

function openNewUser(): void {
  uf.form.reset();
  uf.err.hidden = true;
  uf.pass.value = gerarSenha();
  userDlg.showModal();
  setTimeout(() => uf.name.focus(), 0);
}
$('#uNew').addEventListener('click', openNewUser);
$('#uGen').addEventListener('click', () => { uf.pass.value = gerarSenha(); uf.pass.focus(); });

uf.form.addEventListener('submit', async ev => {
  ev.preventDefault();
  // Trava o botão enquanto envia: cliques repetidos criavam pedidos em paralelo
  // (um criava o acesso e os outros voltavam "já existe", escondendo o sucesso).
  if (uf.submit.disabled) return;
  uf.err.hidden = true;
  const dados = { nome: uf.name.value, email: uf.email.value, senha: uf.pass.value, perfil: uf.role.value === 'admin' ? 'admin' as const : 'user' as const };
  const v = NovoUsuarioInput.safeParse(dados);
  if (!v.success) { uf.err.textContent = primeiraMensagem(v.error); uf.err.hidden = false; return; }
  uf.submit.disabled = true;
  try {
    const novo = await api.createUser(v.data);
    userDlg.close();
    uf.form.reset();
    showCredentials(novo, v.data.senha);
    await renderUsers();
  } catch (e) {
    uf.err.textContent = mensagemDoErro(e);
    uf.err.hidden = false;
    if (isApiError(e) && e.codigo === 'NAO_AUTENTICADO') showLogin();
  } finally {
    uf.submit.disabled = false;
  }
});

// ---------- acesso criado: a senha aparece só aqui ----------
const credDlg = $<HTMLDialogElement>('#credDlg');
function showCredentials(u: Usuario, senha: string): void {
  $('#credSub').textContent = `${u.nome} · ${u.perfil === 'admin' ? 'Admin' : 'User'}`;
  $('#credEmail').textContent = u.email;
  $('#credPass').textContent = senha;
  const copiar = $<HTMLButtonElement>('#credCopy');
  copiar.textContent = 'Copiar acesso';
  copiar.onclick = async () => {
    try {
      await navigator.clipboard.writeText(`Mahanaim · Gestão da liderança\nE-mail: ${u.email}\nSenha provisória: ${senha}\nNo primeiro acesso você vai criar uma senha nova.`);
      copiar.textContent = 'Copiado ✓';
    } catch { toast('Não foi possível copiar. Selecione e copie manualmente.', true); }
  };
  credDlg.showModal();
}
// Ao fechar, a senha some da tela (não fica em lugar nenhum)
credDlg.addEventListener('close', () => { $('#credPass').textContent = ''; $('#credEmail').textContent = ''; });

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
// ATAS DE REUNIÃO — tela própria em /atas
// Todos leem; só admin escreve, edita, fixa e exclui (o banco garante).
// =====================================================================
const ataDoEvento = (eventoId: string) => ATAS.find(a => a.eventoId === eventoId);
/** Minúsculas e sem acento, para a busca achar "reuniao" em "Reunião". */
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fmtEventoCurto = (e: Evento) => (e.t ? `${e.t} · ` : '') + e.n;

const atasBusca = $<HTMLInputElement>('#aBusca');
atasBusca.addEventListener('input', () => renderAtas());

function renderAtas(): void {
  const total = ATAS.length, fixadas = ATAS.filter(a => a.fixada).length;
  $('#atasSub').textContent = (total
    ? `${total} ${total === 1 ? 'ata registrada' : 'atas registradas'}${fixadas ? ` · ${fixadas} ${fixadas === 1 ? 'fixada' : 'fixadas'}` : ''}. `
    : '') + (isAdmin() ? 'Registre o que foi tratado em cada reunião para a liderança consultar depois.' : 'Consulte o que foi tratado nas reuniões da liderança.');
  const termos = normalizar(atasBusca.value).split(/\s+/).filter(Boolean);
  const lista = termos.length
    ? ATAS.filter(a => { const t = normalizar([a.titulo, a.participantes, a.resumo, a.conteudo].join(' ')); return termos.every(x => t.includes(x)); })
    : ATAS;
  const box = $('#atasList');
  if (!lista.length) {
    setHtml(box, html`<p class="empty">${termos.length ? 'Nenhuma ata encontrada com essa busca.' : isAdmin() ? 'Nenhuma ata ainda. Clique em "+ Nova ata" para registrar a primeira reunião.' : 'Nenhuma ata registrada ainda.'}</p>`);
    return;
  }
  setHtml(box, html`${lista.map(a => {
    const ev = a.eventoId ? EVENTS.find(e => e.id === a.eventoId) : undefined;
    const meta = [fmtDate(a.data), cap(diaDaSemana(a.data)), ev && fmtEventoCurto(ev)].filter(Boolean).join(' · ');
    const previa = a.resumo ?? a.conteudo.slice(0, 400);
    return html`<button type="button" class="card${a.fixada ? ' fixada' : ''}" data-ata-id="${a.id}">
      <div class="head"><div><h3>${a.fixada ? raw('<span aria-label="Fixada" title="Fixada">📌</span>') : ''}${a.titulo}</h3><div class="meta">${meta}</div></div>${a.fixada ? raw('<span class="badge">Fixada</span>') : ''}</div>
      <p class="resumo${previa ? '' : ' vazio'}">${previa || 'Sem texto.'}</p>
      <div class="by">${a.autorNome ? `Escrita por ${a.autorNome}` : 'Registrada'} · ${a.atualizadoEm !== a.criadoEm ? `atualizada ${fmtWhen(a.atualizadoEm)}` : fmtWhen(a.criadoEm)}</div>
    </button>`;
  })}`);
  $$<HTMLButtonElement>('[data-ata-id]', box).forEach(b => b.addEventListener('click', () => {
    const a = ATAS.find(x => x.id === b.dataset['ataId']); if (a) openAta(a);
  }));
}

/** Recarrega as atas do servidor e redesenha o que estiver aberto. */
async function recarregarAtas(): Promise<void> {
  ATAS = await api.listMinutes();
  if (!$('#atasPage').hidden) renderAtas();
  reopenDay();
}

// ---------- ler uma ata ----------
const ataDlg = $<HTMLDialogElement>('#ataDlg');
let ataAberta: Ata | null = null;

function openAta(a: Ata): void {
  ataAberta = a;
  const adm = isAdmin();
  const ev = a.eventoId ? EVENTS.find(e => e.id === a.eventoId) : undefined;
  $('#ataTitle').textContent = (a.fixada ? '📌 ' : '') + a.titulo;
  $('#ataSub').textContent = `${cap(diaDaSemana(a.data))}, ${fmtDate(a.data)}` + (ev ? ` · ${fmtEventoCurto(ev)}` : '');
  const autoria = [a.autorNome && `Escrita por ${a.autorNome} em ${fmtWhen(a.criadoEm)}`,
    a.atualizadoEm !== a.criadoEm && `Última edição${a.editorNome ? ` por ${a.editorNome}` : ''} em ${fmtWhen(a.atualizadoEm)}`].filter(Boolean).join(' · ');
  setHtml($('#ataBody'), html`
    ${a.participantes ? html`<h3>Participantes</h3><div class="bloco">${a.participantes}</div>` : ''}
    ${a.resumo ? html`<h3>Resumo</h3><div class="bloco">${a.resumo}</div>` : ''}
    ${a.conteudo ? html`<h3>O que foi discutido</h3><div class="bloco">${a.conteudo}</div>` : ''}
    ${autoria ? html`<p class="by">${autoria}</p>` : ''}`);
  $('#ataEdit').hidden = !adm;
  $('#ataDel').hidden = !adm;
  const pin = $<HTMLButtonElement>('#ataPin');
  pin.hidden = !adm;
  pin.textContent = a.fixada ? 'Desafixar' : '📌 Fixar';
  $('#ataGoto').hidden = !ev;
  if (!ataDlg.open) ataDlg.showModal();
}

const dadosDaAta = (a: Ata): AtaDados => ({
  titulo: a.titulo, data: a.data, participantes: a.participantes, resumo: a.resumo, conteudo: a.conteudo, fixada: a.fixada, eventoId: a.eventoId,
});

$('#ataEdit').addEventListener('click', () => { if (ataAberta) openAtaForm(dadosDaAta(ataAberta), ataAberta.id); });
$<HTMLButtonElement>('#ataPin').addEventListener('click', async ev => {
  const a = ataAberta; if (!a) return;
  const b = ev.currentTarget as HTMLButtonElement;
  b.disabled = true;
  try {
    const nova = await api.updateMinute(a.id, { ...dadosDaAta(a), fixada: !a.fixada });
    await recarregarAtas();
    openAta(ATAS.find(x => x.id === nova.id) ?? nova);
    toast(nova.fixada ? 'Ata fixada no topo.' : 'Ata desafixada.');
  } catch (e) { falha(e); }
  b.disabled = false;
});
$('#ataDel').addEventListener('click', async () => {
  const a = ataAberta; if (!a) return;
  const ok = await ask({ title: 'Excluir esta ata?', msg: `${a.titulo} · ${fmtShort(a.data)}. O texto será apagado de vez e não poderá ser recuperado.`, ok: 'Excluir ata', danger: true });
  if (!ok) return;
  try {
    await api.deleteMinute(a.id);
    ataDlg.close();
    await recarregarAtas();
    toast('Ata excluída.');
  } catch (e) { falha(e); }
});
$('#ataGoto').addEventListener('click', () => {
  const ev = ataAberta?.eventoId ? EVENTS.find(e => e.id === ataAberta?.eventoId) : undefined;
  if (!ev) return;
  navegar(CAMINHO.cal);
  irPara(ev.data);
  openDay(ev.data);
});

// ---------- escrever / editar ----------
const af = {
  dlg: $<HTMLDialogElement>('#ataFormDlg'),
  form: $<HTMLFormElement>('#ataForm'),
  titulo: $<HTMLInputElement>('#afTitulo'),
  data: $<HTMLInputElement>('#afData'),
  evento: $<HTMLSelectElement>('#afEvento'),
  part: $<HTMLInputElement>('#afPart'),
  resumo: $<HTMLTextAreaElement>('#afResumo'),
  conteudo: $<HTMLTextAreaElement>('#afConteudo'),
  fixada: $<HTMLInputElement>('#afFixada'),
  err: $('#afErr'),
  submit: $<HTMLButtonElement>('#afSubmit'),
};
let ataEditId: string | null = null;
let ataInicial = '';
const valoresAta = () => ({
  titulo: af.titulo.value, data: af.data.value, eventoId: af.evento.value, participantes: af.part.value,
  resumo: af.resumo.value, conteudo: af.conteudo.value, fixada: af.fixada.checked,
});
const ataAlterada = () => JSON.stringify(valoresAta()) !== ataInicial;

/** Eventos do dia escolhido (Reuniões primeiro) para ligar a ata. Mantém o atual, se houver. */
function preencherEventosDaAta(atual = af.evento.value): void {
  const dia = af.data.value;
  const doDia = dia ? EVENTS.filter(e => e.data === dia || (!!e.fim && e.data <= dia && dia <= e.fim)) : [];
  doDia.sort((a, b) => Number(b.c === 'reuniao') - Number(a.c === 'reuniao') || minutos(a.t) - minutos(b.t));
  const extra = atual && !doDia.some(e => e.id === atual) ? EVENTS.find(e => e.id === atual) : undefined;
  setHtml(af.evento, html`<option value="">${doDia.length ? 'Nenhum' : dia ? 'Nenhum evento neste dia' : 'Escolha a data primeiro'}</option>
    ${doDia.map(e => html`<option value="${e.id}">${fmtEventoCurto(e)}${e.c === 'reuniao' ? '' : ` (${CATS[e.c].one})`}</option>`)}
    ${extra ? html`<option value="${extra.id}">${fmtShort(extra.data)} · ${fmtEventoCurto(extra)}</option>` : ''}`);
  af.evento.value = doDia.some(e => e.id === atual) || extra ? atual : '';
}
af.data.addEventListener('change', () => preencherEventosDaAta());

function openAtaForm(base: Partial<AtaDados> = {}, id: string | null = null): void {
  ataEditId = id;
  $('#ataFormTitle').textContent = id ? 'Editar ata' : 'Nova ata de reunião';
  $('#ataFormSub').textContent = id ? 'As alterações ficam registradas com seu nome.' : 'Fica salva para a liderança consultar quando precisar.';
  af.titulo.value = base.titulo ?? '';
  af.data.value = base.data ?? hojeKey();
  preencherEventosDaAta(base.eventoId ?? '');
  af.part.value = base.participantes ?? '';
  af.resumo.value = base.resumo ?? '';
  af.conteudo.value = base.conteudo ?? '';
  af.fixada.checked = base.fixada ?? false;
  af.err.hidden = true;
  af.submit.disabled = false;
  ataInicial = JSON.stringify(valoresAta());
  if (ataDlg.open) ataDlg.close();
  af.dlg.showModal();
  setTimeout(() => (af.titulo.value ? af.conteudo : af.titulo).focus(), 0);
}
$('#aNew').addEventListener('click', () => openAtaForm());

/** Fecha o formulário; se houver texto não salvo, pergunta antes. */
async function fecharAtaForm(): Promise<void> {
  if (ataAlterada()) {
    const ok = await ask({ title: 'Descartar o que foi escrito?', msg: 'As alterações desta ata ainda não foram salvas.', ok: 'Descartar', danger: true });
    if (!ok) return;
  }
  af.dlg.close();
}
$('#afCancel').addEventListener('click', () => void fecharAtaForm());
$('#afX').addEventListener('click', () => void fecharAtaForm());
af.dlg.addEventListener('cancel', e => { e.preventDefault(); void fecharAtaForm(); }); // tecla Esc
window.addEventListener('beforeunload', e => { if (af.dlg.open && ataAlterada()) e.preventDefault(); });

af.form.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (af.submit.disabled) return;
  af.err.hidden = true;
  const v = AtaInput.safeParse(valoresAta());
  if (!v.success) { af.err.textContent = primeiraMensagem(v.error); af.err.hidden = false; return; }
  af.submit.disabled = true;
  try {
    const salva = ataEditId ? await api.updateMinute(ataEditId, v.data) : await api.createMinute(v.data);
    af.dlg.close();
    await recarregarAtas();
    toast(ataEditId ? 'Ata atualizada.' : 'Ata salva.');
    openAta(ATAS.find(x => x.id === salva.id) ?? salva);
  } catch (e) {
    af.err.textContent = mensagemDoErro(e);
    af.err.hidden = false;
    if (isApiError(e) && e.codigo === 'NAO_AUTENTICADO') showLogin();
  } finally {
    af.submit.disabled = false;
  }
});

// =====================================================================
// NAVEGAÇÃO E INÍCIO
// =====================================================================
/** Anda um período para trás (-1) ou para frente (+1), conforme a visão. */
function step(n: number): void {
  const y = foco.getFullYear(), m = foco.getMonth(), d = foco.getDate();
  if (view === 'dia') foco = somaDias(foco, n);
  else if (view === 'semana') foco = somaDias(foco, 7 * n);
  else if (view === 'ano') foco = new Date(y + n, m, Math.min(d, new Date(y + n, m + 1, 0).getDate()));
  else foco = new Date(y, m + n, 1);
  render();
}
/** Sai da busca (se houver) para mostrar o calendário de novo. */
function limparBusca(): void {
  if (!busca) return;
  busca = '';
  $<HTMLInputElement>('#busca').value = '';
}
$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
$('#today').addEventListener('click', () => { limparBusca(); irPara(hojeKey()); });
$$<HTMLButtonElement>('#views button').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset['v'];
  view = v === 'semana' || v === 'dia' || v === 'ano' ? v : 'mes';
  limparBusca();
  render();
}));
$$<HTMLButtonElement>('#modo button').forEach(b => b.addEventListener('click', () => {
  modo = b.dataset['m'] === 'lista' ? 'lista' : 'cal';
  gravarPref('mahanaim-modo', modo);
  limparBusca();
  render();
}));
$<HTMLInputElement>('#busca').addEventListener('input', ev => {
  busca = (ev.currentTarget as HTMLInputElement).value.trim();
  if (paginaAtual() !== 'cal') navegar(CAMINHO.cal);
  render();
});
$$<HTMLDialogElement>('dialog').forEach(d => {
  $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
  d.addEventListener('click', e => { if (e.target === d && !d.hasAttribute('data-sticky')) d.close(); });
});
function closeAll(): void { $$<HTMLDialogElement>('dialog[open]').forEach(d => d.close()); }
document.addEventListener('keydown', e => {
  const alvo = e.target as HTMLElement;
  if (document.querySelector('dialog[open]') || $('#appScreen').hidden || $('#calPage').hidden || /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
  if (busca) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

void (async function init() {
  const t = new Date();
  const mh = /^#(\d{4})-(\d{2})$/.exec(location.hash);
  if (mh && !(Number(mh[1]) === t.getFullYear() && Number(mh[2]) - 1 === t.getMonth())) foco = new Date(Number(mh[1]), Number(mh[2]) - 1, 1);
  if (BANCO_NAO_CONFIGURADO) {
    // Site publicado sem as chaves do Supabase: não cai nos dados de exemplo
    showLogin();
    lg.err.textContent = 'O site está sem a configuração do banco de dados. Avise o responsável pelo sistema.';
    lg.err.hidden = false;
    lg.submit.disabled = true;
    return;
  }
  ME = await api.me();
  if (ME) await enterApp(); else showLogin();
})();
