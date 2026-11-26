-- =====================================================================
-- ATAS DE REUNIÃO
-- Bloco de notas das reuniões da liderança: título, data, participantes,
-- um resumo curto (decisões) e o texto livre do que foi discutido.
-- Pode ficar fixada no topo e, opcionalmente, ligada a um evento do
-- calendário (normalmente do tipo Reunião).
--
-- Permissões: todo usuário ATIVO lê; só admin cria, edita, fixa e exclui.
-- Autor e último editor são preenchidos pelo banco (não pelo app), junto
-- com o nome, para que quem não é admin também veja quem escreveu
-- (a tabela perfis só deixa cada um ler o próprio perfil).
-- =====================================================================

create table public.atas (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null check (char_length(titulo) between 1 and 120),
  data_reuniao        date not null,
  participantes       text check (char_length(participantes) <= 500),
  resumo              text check (char_length(resumo) <= 1000),
  conteudo            text not null default '' check (char_length(conteudo) <= 50000),
  fixada              boolean not null default false,
  evento_id           uuid references public.eventos (id) on delete set null,
  criado_por          uuid references public.perfis (id) on delete set null,
  criado_por_nome     text,
  atualizado_por      uuid references public.perfis (id) on delete set null,
  atualizado_por_nome text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index atas_lista_idx  on public.atas (fixada desc, data_reuniao desc);
create index atas_evento_idx on public.atas (evento_id);
create index atas_criado_por_idx on public.atas (criado_por);
create index atas_atualizado_por_idx on public.atas (atualizado_por);

-- Autor/editor sempre vêm da sessão (ninguém assina em nome de outro)
create or replace function public.atas_autoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nome text;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por      := auth.uid();
    new.criado_por_nome := v_nome;
    new.criado_em       := now();
  else
    new.criado_por      := old.criado_por;
    new.criado_por_nome := old.criado_por_nome;
    new.criado_em       := old.criado_em;
  end if;
  new.atualizado_por      := auth.uid();
  new.atualizado_por_nome := v_nome;
  new.atualizado_em       := now();
  return new;
end $$;
revoke execute on function public.atas_autoria() from public, anon, authenticated;

create trigger atas_autoria before insert or update on public.atas
  for each row execute function public.atas_autoria();

-- Segurança
alter table public.atas enable row level security;

create policy atas_select on public.atas for select to authenticated
  using ((select public.is_ativo()));
create policy atas_insert on public.atas for insert to authenticated
  with check ((select public.is_admin()));
create policy atas_update on public.atas for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy atas_delete on public.atas for delete to authenticated
  using ((select public.is_admin()));

grant select, insert, update, delete on public.atas to authenticated;
