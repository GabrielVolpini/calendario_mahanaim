// =====================================================================
// Gera a migração de CARGA INICIAL do Supabase a partir de src/data/seed.ts
// (os cultos, eventos especiais, aniversários, datas comemorativas e
// campanhas que existiam no protótipo).
//
//   node scripts/gerar-carga-inicial.ts > supabase/migrations/<versao>_carga_inicial.sql
//
// Feriados NÃO entram: o banco já os gera com gerar_feriados(ano).
// Usuários e solicitações de demonstração também não: no banco real os
// acessos são criados no Supabase Auth (com senha só como hash).
// =====================================================================
import { criarBancoDemo } from '../src/data/seed.ts';
import type { Evento } from '../src/domain/types.ts';

const LOCAIS = new Set(['Santo André', 'Ribeirão Pires']);

/** Nome e regra legível de cada série recorrente do protótipo. */
const SERIES: Record<string, { titulo: string; regra: string }> = {
  'santa-ceia':       { titulo: 'Culto de Santa Ceia',      regra: '2º domingo do mês' },
  'familia-10h-sa':   { titulo: 'Culto da Família',         regra: 'todo domingo 10h · Santo André' },
  'familia-1830-sa':  { titulo: 'Culto da Família',         regra: 'todo domingo 18h30 · Santo André' },
  'familia-1830-rp':  { titulo: 'Culto da Família',         regra: 'todo domingo 18h30 · Ribeirão Pires' },
  'homens-honra':     { titulo: 'Culto de Homens de Honra', regra: '3ª segunda-feira do mês' },
  'terca-profetica':  { titulo: 'Terça Profética',          regra: 'toda terça · Santo André' },
  'teens':            { titulo: 'Teens',                    regra: 'toda terça' },
  'quarta-profetica': { titulo: 'Quarta Profética',         regra: 'toda quarta · Ribeirão Pires' },
  'oracao':           { titulo: 'Culto de Oração',          regra: 'toda quinta · Santo André' },
  'mulheres':         { titulo: 'Culto das Mulheres',       regra: '3º sábado do mês' },
  'start':            { titulo: 'Culto Start',              regra: 'último sábado do mês' },
};

const q = (v: string | undefined | null): string => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`);

/** "10h" → '10:00', "18h30" → '18:30' */
function hora(t: string | undefined): string {
  if (!t) return 'null';
  const m = /^(\d{1,2})h(\d{2})?$/.exec(t);
  if (!m) throw new Error(`Horário inválido no seed: ${t}`);
  return `'${m[1]!.padStart(2, '0')}:${m[2] ?? '00'}'`;
}

function tipo(e: Evento): string {
  switch (e.c) {
    case 'culto': return 'culto';
    case 'aniv': return 'aniversario';
    case 'data': return 'data_comemorativa';
    case 'evento': return e.n.startsWith('Conferência') ? 'conferencia' : 'especial';
    case 'feriado': throw new Error('feriados vêm de gerar_feriados()');
  }
}

const db = criarBancoDemo();
const eventos = db.events.filter(e => e.c !== 'feriado');
for (const e of eventos) if (e.serie && !SERIES[e.serie]) throw new Error(`Série sem descrição: ${e.serie}`);

// Agrupa ocorrências idênticas (mesma série, horário, local...) numa só linha
// com a lista de datas: deixa a migração bem menor e fácil de conferir.
const grupos = new Map<string, { campos: string; datas: string[] }>();
for (const e of eventos) {
  const local = e.l && LOCAIS.has(e.l) ? e.l : undefined;
  const obs = e.l && !LOCAIS.has(e.l) ? e.l : undefined;
  const campos = `${q(e.n)}, '${tipo(e)}', ${q(e.fim)}, ${hora(e.t)}, ${q(local)}, ${q(obs)}, ${q(e.serie)}`;
  const g = grupos.get(campos) ?? { campos, datas: [] };
  g.datas.push(e.data);
  grupos.set(campos, g);
}
const linhasEventos = [...grupos.values()].map(g => {
  const linhas: string[] = [];
  for (let i = 0; i < g.datas.length; i += 8) linhas.push(g.datas.slice(i, i + 8).map(d => `'${d}'`).join(','));
  return `  (${g.campos},\n   array[${linhas.join(',\n         ')}])`;
});

const linhasSeries = Object.entries(SERIES).map(([k, s]) => `  (${q(k)}, ${q(s.titulo)}, ${q(s.regra)})`);

const linhasCampanhas = Object.entries(db.campanhas).map(([ym, c]) => {
  const [ano, mes] = ym.split('-');
  return `  (${Number(ano)}, ${Number(mes)}, ${q(c.n)}, ${q(c.s)}, ${q(c.c)})`;
});

console.log(`-- =====================================================================
-- CARGA INICIAL — dados que existiam no protótipo (src/data/seed.ts)
-- Gerado por scripts/gerar-carga-inicial.ts. Não editar à mão.
-- ${eventos.length} eventos, ${linhasSeries.length} séries, ${linhasCampanhas.length} campanhas.
-- Feriados já são criados por gerar_feriados(ano).
-- =====================================================================

-- Séries (cultos recorrentes). A chave só existe durante a carga.
create temporary table _series_carga (
  chave  text primary key,
  id     uuid not null default gen_random_uuid(),
  titulo text not null,
  regra  text not null
);

insert into _series_carga (chave, titulo, regra) values
${linhasSeries.join(',\n')};

insert into public.series (id, titulo, regra)
select id, titulo, regra from _series_carga;

-- Eventos (cultos, eventos especiais, aniversários e datas comemorativas)
insert into public.eventos (titulo, tipo, data_inicio, data_fim, hora_inicio, local_id, observacao, serie_id, status)
select v.titulo, v.tipo, d.dia::date, v.data_fim::date, v.hora_inicio::time,
       l.id, v.observacao, s.id, 'aprovado'
from (values
${linhasEventos.join(',\n')}
) as v (titulo, tipo, data_fim, hora_inicio, local_nome, observacao, serie_chave, datas)
cross join lateral unnest(v.datas) as d (dia)
left join public.locais l on l.nome = v.local_nome
left join _series_carga s on s.chave = v.serie_chave;

drop table _series_carga;

-- Campanhas do mês
insert into public.campanhas (ano, mes, nome, descricao, cor) values
${linhasCampanhas.join(',\n')}
on conflict (ano, mes) do nothing;`);
