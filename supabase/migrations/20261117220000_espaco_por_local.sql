-- =====================================================================
-- Local + espaço do evento
--   Local:  Santo André, Ribeirão Pires ou Evento externo (tabela locais)
--   Espaço: depende do local
--     Santo André    → Templo, Sala Ebenezer, Sala Sementes, Sala Betel, Mahanadance
--     Ribeirão Pires → Templo, Sala Pastoral
--     Evento externo → sem espaço
-- Espelha UNIDADES / ESPACOS_DA_UNIDADE em src/domain/types.ts.
-- =====================================================================

-- "Evento externo" deixa de ser espaço e vira um local
insert into public.locais (nome) values ('Evento externo') on conflict (nome) do nothing;
update public.eventos
   set local_id = (select id from public.locais where nome = 'Evento externo'), espaco = null
 where espaco = 'externo';

alter table public.eventos drop constraint eventos_espaco_check;
alter table public.eventos add constraint eventos_espaco_check
  check (espaco in ('templo', 'ebenezer', 'sementes', 'betel', 'mahanadance', 'pastoral'));

-- O espaço precisa existir no local escolhido (vale também para quem chama a API direto)
create or replace function public.validar_espaco_do_local()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_local text;
begin
  if new.espaco is null then return new; end if;
  select nome into v_local from public.locais where id = new.local_id;
  if not (
       (v_local = 'Santo André'    and new.espaco in ('templo', 'ebenezer', 'sementes', 'betel', 'mahanadance'))
    or (v_local = 'Ribeirão Pires' and new.espaco in ('templo', 'pastoral'))
  ) then
    raise exception 'Esse espaço não existe no local escolhido.';
  end if;
  return new;
end $$;
revoke execute on function public.validar_espaco_do_local() from public, anon, authenticated;

create trigger eventos_validar_espaco
  before insert or update of espaco, local_id on public.eventos
  for each row execute function public.validar_espaco_do_local();
