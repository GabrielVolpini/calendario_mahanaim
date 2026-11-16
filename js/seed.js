// =====================================================================
// DADOS DE EXEMPLO (SEED)
// Na fase de banco de dados, este arquivo vira o script de carga inicial.
// Todos os eventos são registros concretos (uma linha por data). Eventos
// recorrentes compartilham o mesmo campo `serie`, o que permite editar
// "somente este dia" ou "este e os próximos".
// =====================================================================
window.SEED = (function () {
  const SA = 'Santo André', RP = 'Ribeirão Pires';
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const events = [];
  let seq = 0;
  const add = (data, c, n, extra = {}) => {
    const e = { id: 'e' + (++seq), data, c, n };
    Object.entries(extra).forEach(([k, v]) => { if (v != null) e[k] = v; });
    events.push(e);
  };

  // ---- Cultos fixos (recorrentes) ----
  for (let dt = new Date(2026, 10, 1); dt <= new Date(2027, 11, 31); dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear(), m = dt.getMonth(), d = dt.getDate(), w = dt.getDay(), k = key(y, m, d);
    const dim = new Date(y, m + 1, 0).getDate(), nth = Math.ceil(d / 7), last = d + 7 > dim;
    if (w === 0) {
      if ((nth === 2 && k !== '2026-12-13') || k === '2026-12-06') add(k, 'culto', 'Culto de Santa Ceia', { serie: 'santa-ceia' });
      add(k, 'culto', 'Culto da Família', { t: '10h', l: SA, serie: 'familia-10h-sa' });
      if (!['2026-12-27', '2027-01-03'].includes(k)) add(k, 'culto', 'Culto da Família', { t: '18h30', l: SA, serie: 'familia-1830-sa' });
      add(k, 'culto', 'Culto da Família', { t: '18h30', l: RP, serie: 'familia-1830-rp' });
    }
    if (w === 1 && nth === 3 && k !== '2026-11-16') add(k, 'culto', 'Culto de Homens de Honra', { serie: 'homens-honra' });
    if (k === '2026-11-30') add(k, 'culto', 'Culto de Homens de Honra', { l: 'Data alterada (era 16/11)' });
    if (w === 2) {
      add(k, 'culto', 'Terça Profética', { l: SA, serie: 'terca-profetica' });
      add(k, 'culto', 'Teens', { serie: 'teens' });
    }
    if (w === 3) add(k, 'culto', 'Quarta Profética', { l: RP, serie: 'quarta-profetica' });
    if (w === 4 && !['2026-12-24', '2026-12-31'].includes(k)) add(k, 'culto', 'Culto de Oração', { l: SA, serie: 'oracao' });
    if (w === 6) {
      if (nth === 3) add(k, 'culto', 'Culto das Mulheres', { serie: 'mulheres' });
      if (last && !['2027-03-27', '2026-12-26'].includes(k)) add(k, 'culto', 'Culto Start', { serie: 'start' });
    }
  }

  // ---- Datas específicas ----
  [
    ['2026-11-02', 'feriado', 'Finados'],
    ['2026-11-15', 'feriado', 'Proclamação da República'],
    ['2026-11-20', 'feriado', 'Dia da Consciência Negra'],
    ['2026-12-25', 'feriado', 'Natal'],
    ['2027-01-01', 'feriado', 'Confraternização Universal'],
    ['2027-02-08', 'feriado', 'Carnaval', 'Ponto facultativo'],
    ['2027-02-09', 'feriado', 'Carnaval', 'Ponto facultativo'],
    ['2027-03-19', 'feriado', 'Feriado municipal', RP],
    ['2027-03-26', 'feriado', 'Sexta-feira da Paixão'],
    ['2027-04-08', 'feriado', 'Aniversário de Santo André', 'Feriado municipal'],
    ['2027-04-21', 'feriado', 'Tiradentes'],
    ['2027-05-01', 'feriado', 'Dia do Trabalho'],
    ['2027-05-27', 'feriado', 'Corpus Christi', 'Feriado em Santo André e Ribeirão Pires'],
    ['2027-07-09', 'feriado', 'Revolução Constitucionalista', 'Feriado estadual de SP'],
    ['2027-09-07', 'feriado', 'Independência do Brasil'],
    ['2027-10-12', 'feriado', 'Feriado: Dia das Crianças'],
    ['2027-11-02', 'feriado', 'Finados'],
    ['2027-11-15', 'feriado', 'Proclamação da República'],
    ['2027-11-20', 'feriado', 'Dia da Consciência Negra'],
    ['2027-12-25', 'feriado', 'Natal'],
    ['2026-11-01', 'evento', 'Apresentação de Bebês', 'No culto'],
    ['2026-11-06', 'evento', 'Vigília'],
    ['2026-11-15', 'evento', 'Apresentação de Bebês', 'No culto'],
    ['2026-11-12', 'evento', 'Curso Novos Membros'],
    ['2026-11-14', 'evento', 'Imersão para Líderes e Liderados'],
    ['2026-11-19', 'evento', 'Curso Novos Membros'],
    ['2026-11-26', 'evento', 'Curso Novos Membros'],
    ['2026-12-03', 'evento', 'Curso Novos Membros'],
    ['2026-12-05', 'evento', 'Confraternização das Mulheres'],
    ['2026-11-27', 'evento', 'Confraternização Ministério de Casais'],
    ['2026-11-28', 'evento', 'Confraternização Buffet Mahanaim'],
    ['2026-12-11', 'evento', 'Confraternização MahanaKids e MahanaRise'],
    ['2026-12-12', 'evento', 'Confraternização Equipe do Amor e Obreiros'],
    ['2026-12-14', 'evento', 'Confraternização Homens de Honra', 'Na igreja'],
    ['2026-12-06', 'evento', 'Apresentação de Novos Membros', 'No culto'],
    ['2027-05-28', 'evento', 'Conferência Start'],
    ['2027-05-29', 'evento', 'Conferência Start'],
    ['2027-10-23', 'evento', 'MahanaDay com a família', 'MahanaKids'],
    ['2027-03-09', 'aniv', 'Aniversário da Pra. Juliana', 'Comemoração no culto'],
    ['2027-03-14', 'aniv', 'Homenagem à Pra. Juliana'],
    ['2027-06-13', 'aniv', 'Dia do Pastor', 'Data a confirmar'],
    ['2027-10-16', 'aniv', 'Aniversário do Pr. Daniel'],
    ['2027-10-17', 'aniv', 'Homenagem ao Pr. Daniel'],
    ['2026-11-30', 'data', 'Dia Nacional do Evangélico'],
    ['2026-12-13', 'data', 'Dia da Bíblia'],
    ['2027-03-28', 'data', 'Páscoa'],
    ['2027-05-09', 'data', 'Dia das Mães'],
    ['2027-08-08', 'data', 'Dia dos Pais'],
    ['2027-10-31', 'data', 'Dia da Reforma Protestante', '510 anos'],
    ['2027-11-30', 'data', 'Dia Nacional do Evangélico'],
    ['2027-12-12', 'data', 'Dia da Bíblia'],
  ].forEach(([k, c, n, l]) => add(k, c, n, { l }));

  // ---- Eventos de vários dias (data + fim) ----
  add('2027-02-26', 'evento', 'Conferência da Igreja', { fim: '2027-02-28', l: 'Aniversário de 14 anos' });
  add('2027-03-25', 'evento', 'Acampamento Start e Teens', { fim: '2027-03-28', l: 'Início na noite de 25/03' });

  // ---- Campanhas do mês ----
  const campanhas = {
    '2026-11': { n: 'Novembro Azul', s: 'Conscientização sobre o câncer de próstata', c: 'azul' },
    '2027-09': { n: 'Setembro Amarelo', s: 'Prevenção ao suicídio', c: 'amarelo' },
    '2027-10': { n: 'Outubro Rosa', s: 'Conscientização sobre o câncer de mama', c: 'rosa' },
    '2027-11': { n: 'Novembro Azul', s: 'Conscientização sobre o câncer de próstata', c: 'azul' },
  };

  // ---- Usuários de demonstração (senhas em texto só no protótipo!) ----
  const users = [
    { id: 'u1', nome: 'Administrador Demo', email: 'admin@mahanaim.demo', senha: 'admin123', perfil: 'admin', ativo: true },
    { id: 'u2', nome: 'Membro Demo', email: 'membro@mahanaim.demo', senha: 'membro123', perfil: 'user', ativo: true },
    { id: 'u3', nome: 'Líder de Louvor', email: 'louvor@mahanaim.demo', senha: 'louvor123', perfil: 'user', ativo: true },
  ];

  // ---- Solicitações de exemplo ----
  const requests = [
    { id: 'r1', status: 'pendente', autorId: 'u2', criadoEm: '2026-11-14T10:20:00',
      mensagem: 'Gostaríamos de reservar o salão para o ensaio geral de Natal.',
      evento: { data: '2026-11-21', c: 'evento', n: 'Ensaio geral do Natal', t: '15h', l: SA } },
    { id: 'r2', status: 'pendente', autorId: 'u3', criadoEm: '2026-11-15T19:02:00',
      mensagem: 'Noite de louvor aberta para toda a igreja.',
      evento: { data: '2026-12-04', c: 'evento', n: 'Noite de Louvor', t: '20h', l: RP } },
    { id: 'r3', status: 'recusada', autorId: 'u2', criadoEm: '2026-11-10T08:45:00',
      evento: { data: '2026-11-20', c: 'evento', n: 'Bazar beneficente', t: '9h', l: SA },
      motivo: 'Feriado: prédio fechado. Que tal 28/11?', revisadoPor: 'u1', revisadoEm: '2026-11-11T09:00:00' },
  ];

  return { events, campanhas, users, requests, seq: 1000 };
})();
