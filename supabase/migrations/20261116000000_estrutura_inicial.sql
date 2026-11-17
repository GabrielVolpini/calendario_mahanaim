-- =====================================================================
-- Calendário Mahanaim — estrutura inicial do banco (Supabase / Postgres)
--
-- Login, senha (hash bcrypt) e token de sessão ficam no Supabase Auth
-- (schema `auth`). Aqui guardamos só o que é do app:
--
--   perfis          1:1 com auth.users  → nome, permissão, ativo
--   tipos_evento    culto, conferência, reunião, feriado, especial...
--   locais          Santo André, Ribeirão Pires...
--   series          agrupa eventos recorrentes (ex.: Culto da Família 10h)
--   eventos         tudo que aparece no calendário (com status de aprovação)
--   solicitacoes    a "fila": pedido de um usuário + resposta do admin
--   campanhas       campanha do mês (Novembro Azul etc.)
--   feriados_base   regras de feriado → gerar_feriados(ano) cria os eventos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.perfil_usuario as enum ('admin', 'user');
create type public.status_evento  as enum ('pendente', 'aprovado', 'recusado', 'cancelado');

-- Atualiza a coluna atualizado_em automaticamente
create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- PERFIS (usuários do sistema)
-- E-mail e senha_hash ficam em auth.users; o token de 30 dias é a
-- sessão (refresh token) do Supabase Auth, guardada em auth.sessions.
-- ---------------------------------------------------------------------
create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null,
  email         text not null unique,
  perfil        public.perfil_usuario not null default 'user',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger perfis_atualizado_em before update on public.perfis
  for each row execute function public.set_atualizado_em();

-- Cria o perfil automaticamente quando um usuário é criado no Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper usado nas políticas de segurança (RLS)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and perfil = 'admin' and ativo
  );
$$;

-- ---------------------------------------------------------------------
-- TIPOS DE EVENTO (tabela em vez de enum: dá pra criar tipos e cores
-- novos pelo painel sem migração)
-- ---------------------------------------------------------------------
create table public.tipos_evento (
  slug   text primary key,
  nome   text not null,
  cor    text not null,
  ordem  smallint not null default 0
);
insert into public.tipos_evento (slug, nome, cor, ordem) values
  ('culto',             'Culto',             'roxo',     1),
  ('conferencia',       'Conferência',       'laranja',  2),
  ('reuniao',           'Reunião',           'azul',     3),
  ('feriado',           'Feriado',           'vermelho', 4),
  ('especial',          'Evento especial',   'verde',    5),  -- confraternizações, treinamentos, imersões
  ('aniversario',       'Aniversário',       'rosa',     6),  -- já usado no protótipo
  ('data_comemorativa', 'Data comemorativa', 'cinza',    7);  -- Páscoa, Dia da Bíblia... (já usado no protótipo)

-- ---------------------------------------------------------------------
-- LOCAIS
-- ---------------------------------------------------------------------
create table public.locais (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique,
  ativo boolean not null default true
);
insert into public.locais (nome) values ('Santo André'), ('Ribeirão Pires');

-- ---------------------------------------------------------------------
-- SÉRIES (eventos recorrentes). Cada ocorrência é uma linha em eventos
-- com o mesmo serie_id: permite editar "só este dia" ou "este e os próximos".
-- ---------------------------------------------------------------------
create table public.series (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  regra      text,                       -- descrição legível, ex.: "todo domingo 10h"
  criado_por uuid references public.perfis (id) on delete set null,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- FERIADOS BASE (regras) → a função gerar_feriados(ano) cria os eventos
-- ---------------------------------------------------------------------
create table public.feriados_base (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  regra             text not null check (regra in ('fixo', 'pascoa')),
  mes               smallint check (mes between 1 and 12),
  dia               smallint check (dia between 1 and 31),
  dias_apos_pascoa  smallint,            -- ex.: Sexta da Paixão = -2, Corpus Christi = 60
  abrangencia       text not null default 'nacional'
                    check (abrangencia in ('nacional', 'estadual', 'municipal', 'facultativo')),
  observacao        text,
  ativo             boolean not null default true,
  check ((regra = 'fixo'   and mes is not null and dia is not null)
      or (regra = 'pascoa' and dias_apos_pascoa is not null))
);
insert into public.feriados_base (nome, regra, mes, dia, dias_apos_pascoa, abrangencia, observacao) values
  ('Confraternização Universal',   'fixo',   1,  1,  null, 'nacional',    null),
  ('Carnaval',                     'pascoa', null, null, -48, 'facultativo', 'Ponto facultativo'),
  ('Carnaval',                     'pascoa', null, null, -47, 'facultativo', 'Ponto facultativo'),
  ('Sexta-feira da Paixão',        'pascoa', null, null, -2,  'nacional',    null),
  ('Feriado municipal',            'fixo',   3, 19,  null, 'municipal',   'Ribeirão Pires'),
  ('Aniversário de Santo André',   'fixo',   4,  8,  null, 'municipal',   'Feriado municipal'),
  ('Tiradentes',                   'fixo',   4, 21,  null, 'nacional',    null),
  ('Dia do Trabalho',              'fixo',   5,  1,  null, 'nacional',    null),
  ('Corpus Christi',               'pascoa', null, null, 60,  'municipal',   'Feriado em Santo André e Ribeirão Pires'),
  ('Revolução Constitucionalista', 'fixo',   7,  9,  null, 'estadual',    'Feriado estadual de SP'),
  ('Independência do Brasil',      'fixo',   9,  7,  null, 'nacional',    null),
  ('Nossa Senhora Aparecida',      'fixo',  10, 12,  null, 'nacional',    'Dia das Crianças'),
  ('Finados',                      'fixo',  11,  2,  null, 'nacional',    null),
  ('Proclamação da República',     'fixo',  11, 15,  null, 'nacional',    null),
  ('Dia da Consciência Negra',     'fixo',  11, 20,  null, 'nacional',    null),
  ('Natal',                        'fixo',  12, 25,  null, 'nacional',    null);

-- ---------------------------------------------------------------------
-- EVENTOS
-- ---------------------------------------------------------------------
create table public.eventos (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(trim(titulo)) > 0),
  descricao      text,
  tipo           text not null references public.tipos_evento (slug),
  data_inicio    date not null,
  data_fim       date,                                   -- só para eventos de vários dias
  hora_inicio    time,                                   -- nulo = dia inteiro / sem horário definido
  hora_fim       time,
  qtd_pessoas    integer check (qtd_pessoas > 0),        -- opcional
  local_id       uuid references public.locais (id) on delete set null,
  observacao     text,                                   -- "No culto", "Data a confirmar"...
  serie_id       uuid references public.series (id) on delete set null,
  feriado_id     uuid references public.feriados_base (id) on delete set null,
  status         public.status_evento not null default 'aprovado',
  criado_por     uuid references public.perfis (id) on delete set null,
  atualizado_por uuid references public.perfis (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio),
  check (hora_fim is null or hora_inicio is not null),
  check (hora_fim is null or data_fim is not null or hora_fim > hora_inicio)
);
create index eventos_periodo_idx on public.eventos (data_inicio, coalesce(data_fim, data_inicio));
create index eventos_status_idx  on public.eventos (status);
create index eventos_serie_idx   on public.eventos (serie_id, data_inicio) where serie_id is not null;
create unique index eventos_feriado_unico on public.eventos (feriado_id, data_inicio) where feriado_id is not null;
create trigger eventos_atualizado_em before update on public.eventos
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- SOLICITAÇÕES (a fila de aprovação)
-- O pedido cria um evento com status 'pendente' + uma linha aqui com
-- os dados do fluxo. A fila = solicitações cujo evento está pendente.
-- ---------------------------------------------------------------------
create table public.solicitacoes (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null unique references public.eventos (id) on delete cascade,
  solicitante_id uuid not null references public.perfis (id) on delete cascade,
  mensagem       text,                 -- recado do solicitante
  motivo_recusa  text,                 -- resposta do admin ao recusar
  revisado_por   uuid references public.perfis (id) on delete set null,
  revisado_em    timestamptz,
  criado_em      timestamptz not null default now()
);
create index solicitacoes_solicitante_idx on public.solicitacoes (solicitante_id);

create view public.fila_solicitacoes with (security_invoker = true) as
  select s.*, e.titulo, e.tipo, e.data_inicio, e.data_fim, e.hora_inicio, e.hora_fim,
         e.local_id, e.qtd_pessoas, e.status, p.nome as solicitante_nome
  from public.solicitacoes s
  join public.eventos e on e.id = s.evento_id
  join public.perfis  p on p.id = s.solicitante_id;

-- ---------------------------------------------------------------------
-- CAMPANHAS DO MÊS
-- ---------------------------------------------------------------------
create table public.campanhas (
  ano       smallint not null,
  mes       smallint not null check (mes between 1 and 12),
  nome      text not null,
  descricao text,
  cor       text not null default 'azul',
  primary key (ano, mes)
);

-- =====================================================================
-- FUNÇÕES DE NEGÓCIO (RPC) — chamadas pelo app via supabase.rpc(...)
-- =====================================================================

-- Data da Páscoa (algoritmo de Meeus/Jones/Butcher)
create or replace function public.data_pascoa(ano int)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := ano % 19; b := ano / 100; c := ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19*a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2*e + 2*i - h - k) % 7; m := (a + 11*h + 22*l) / 451;
  return make_date(ano, (h + l - 7*m + 114) / 31, ((h + l - 7*m + 114) % 31) + 1);
end $$;

-- Gera os feriados de um ano como eventos (pode rodar de novo: não duplica)
create or replace function public.gerar_feriados(p_ano int)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_qtd int;
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'Acesso restrito a administradores.';
  end if;
  insert into public.eventos (titulo, tipo, data_inicio, observacao, feriado_id, status)
  select f.nome, 'feriado',
         case f.regra when 'fixo' then make_date(p_ano, f.mes, f.dia)
                      else public.data_pascoa(p_ano) + f.dias_apos_pascoa end,
         f.observacao, f.id, 'aprovado'
  from public.feriados_base f
  where f.ativo
  on conflict (feriado_id, data_inicio) where feriado_id is not null do nothing;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- Usuário envia um pedido de evento
create or replace function public.solicitar_evento(
  p_titulo text, p_tipo text, p_data_inicio date,
  p_data_fim date default null, p_hora_inicio time default null, p_hora_fim time default null,
  p_local_id uuid default null, p_qtd_pessoas int default null,
  p_descricao text default null, p_mensagem text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_evento uuid; v_sol uuid;
begin
  if not exists (select 1 from public.perfis where id = auth.uid() and ativo) then
    raise exception 'Faça login para enviar uma solicitação.';
  end if;
  if p_tipo = 'feriado' then raise exception 'Feriados são gerados automaticamente.'; end if;

  insert into public.eventos (titulo, tipo, data_inicio, data_fim, hora_inicio, hora_fim,
                              local_id, qtd_pessoas, descricao, status, criado_por)
  values (trim(p_titulo), p_tipo, p_data_inicio, p_data_fim, p_hora_inicio, p_hora_fim,
          p_local_id, p_qtd_pessoas, p_descricao, 'pendente', auth.uid())
  returning id into v_evento;

  insert into public.solicitacoes (evento_id, solicitante_id, mensagem)
  values (v_evento, auth.uid(), nullif(trim(p_mensagem), ''))
  returning id into v_sol;
  return v_sol;
end $$;

-- Admin aprova (para "ajustar e aprovar": editar o evento antes e depois aprovar)
create or replace function public.aprovar_solicitacao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_evento uuid;
begin
  if not public.is_admin() then raise exception 'Acesso restrito a administradores.'; end if;
  select s.evento_id into v_evento from public.solicitacoes s
    join public.eventos e on e.id = s.evento_id
    where s.id = p_id and e.status = 'pendente' for update;
  if v_evento is null then raise exception 'Solicitação não encontrada ou já respondida.'; end if;

  update public.eventos set status = 'aprovado', atualizado_por = auth.uid() where id = v_evento;
  update public.solicitacoes set revisado_por = auth.uid(), revisado_em = now() where id = p_id;
end $$;

-- Admin recusa, com motivo opcional
create or replace function public.recusar_solicitacao(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_evento uuid;
begin
  if not public.is_admin() then raise exception 'Acesso restrito a administradores.'; end if;
  select s.evento_id into v_evento from public.solicitacoes s
    join public.eventos e on e.id = s.evento_id
    where s.id = p_id and e.status = 'pendente' for update;
  if v_evento is null then raise exception 'Solicitação não encontrada ou já respondida.'; end if;

  update public.eventos set status = 'recusado', atualizado_por = auth.uid() where id = v_evento;
  update public.solicitacoes
     set motivo_recusa = nullif(trim(p_motivo), ''), revisado_por = auth.uid(), revisado_em = now()
   where id = p_id;
end $$;

-- Solicitante cancela o próprio pedido enquanto pendente
create or replace function public.cancelar_solicitacao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_evento uuid;
begin
  select s.evento_id into v_evento from public.solicitacoes s
    join public.eventos e on e.id = s.evento_id
    where s.id = p_id and s.solicitante_id = auth.uid() and e.status = 'pendente' for update;
  if v_evento is null then raise exception 'Solicitação não encontrada.'; end if;
  update public.eventos set status = 'cancelado' where id = v_evento;
end $$;

-- =====================================================================
-- SEGURANÇA (Row Level Security)
-- Regra geral: todos logados leem; só admin grava. Usuário comum só
-- cria pedidos pelas funções acima.
-- =====================================================================
alter table public.perfis        enable row level security;
alter table public.tipos_evento  enable row level security;
alter table public.locais        enable row level security;
alter table public.series        enable row level security;
alter table public.feriados_base enable row level security;
alter table public.eventos       enable row level security;
alter table public.solicitacoes  enable row level security;
alter table public.campanhas     enable row level security;

-- perfis: cada um vê o seu; admin vê e edita todos
create policy perfis_select on public.perfis for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy perfis_admin_update on public.perfis for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- tabelas de apoio: leitura para logados, escrita só admin
create policy tipos_select    on public.tipos_evento  for select to authenticated using (true);
create policy tipos_admin     on public.tipos_evento  for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy locais_select   on public.locais        for select to authenticated using (true);
create policy locais_admin    on public.locais        for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy series_select   on public.series        for select to authenticated using (true);
create policy series_admin    on public.series        for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy feriados_select on public.feriados_base for select to authenticated using (true);
create policy feriados_admin  on public.feriados_base for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy camp_select     on public.campanhas     for select to authenticated using (true);
create policy camp_admin      on public.campanhas     for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- eventos: todos veem os aprovados; o autor vê os próprios pedidos; admin vê tudo
create policy eventos_select on public.eventos for select to authenticated
  using (status = 'aprovado' or criado_por = (select auth.uid()) or public.is_admin());
create policy eventos_admin on public.eventos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- solicitações: o autor vê as suas; admin vê todas (escrita via funções)
create policy sol_select on public.solicitacoes for select to authenticated
  using (solicitante_id = (select auth.uid()) or public.is_admin());

-- Funções: só usuários logados podem chamar
revoke execute on function public.solicitar_evento, public.aprovar_solicitacao,
  public.recusar_solicitacao, public.cancelar_solicitacao, public.gerar_feriados
  from public, anon;
grant execute on function public.solicitar_evento, public.aprovar_solicitacao,
  public.recusar_solicitacao, public.cancelar_solicitacao, public.gerar_feriados
  to authenticated;

-- Feriados já prontos para 2026 e 2027
select public.gerar_feriados(2026);
select public.gerar_feriados(2027);
