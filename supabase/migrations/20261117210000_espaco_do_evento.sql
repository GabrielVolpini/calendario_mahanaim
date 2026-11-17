-- =====================================================================
-- Espaço do evento: onde ele acontece dentro (ou fora) da igreja.
-- Opcional: feriados, aniversários e eventos antigos não têm espaço.
-- Os valores espelham ESPACOS em src/domain/types.ts.
-- =====================================================================
alter table public.eventos
  add column espaco text
  constraint eventos_espaco_check
  check (espaco in ('externo', 'templo', 'ebenezer', 'sementes', 'betel', 'mahanadance'));

-- solicitar_evento ganha p_espaco (troca de assinatura: remove a antiga)
drop function if exists public.solicitar_evento(text, text, date, date, time, time, uuid, int, text, text, text);

create function public.solicitar_evento(
  p_titulo text, p_tipo text, p_data_inicio date,
  p_data_fim date default null, p_hora_inicio time default null, p_hora_fim time default null,
  p_local_id uuid default null, p_qtd_pessoas int default null,
  p_descricao text default null, p_mensagem text default null, p_observacao text default null,
  p_espaco text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_evento uuid; v_sol uuid;
begin
  if not exists (select 1 from public.perfis where id = auth.uid() and ativo) then
    raise exception 'Faça login para enviar uma solicitação.';
  end if;
  if public.is_admin() then
    -- (sem a palavra "administradores": o app trataria como erro de permissão)
    raise exception 'Quem é admin cria o evento direto no calendário, sem passar por aprovação.';
  end if;
  if p_tipo = 'feriado' then raise exception 'Feriados são gerados automaticamente.'; end if;
  if (select count(*) from public.solicitacoes s join public.eventos e on e.id = s.evento_id
      where s.solicitante_id = auth.uid() and e.status = 'pendente') >= 10 then
    raise exception 'Você já tem 10 solicitações pendentes. Aguarde a liderança responder.';
  end if;

  insert into public.eventos (titulo, tipo, data_inicio, data_fim, hora_inicio, hora_fim,
                              local_id, qtd_pessoas, descricao, observacao, espaco, status, criado_por)
  values (trim(p_titulo), p_tipo, p_data_inicio, p_data_fim, p_hora_inicio, p_hora_fim,
          p_local_id, p_qtd_pessoas, p_descricao, nullif(trim(p_observacao), ''),
          nullif(p_espaco, ''), 'pendente', auth.uid())
  returning id into v_evento;

  insert into public.solicitacoes (evento_id, solicitante_id, mensagem)
  values (v_evento, auth.uid(), nullif(trim(p_mensagem), ''))
  returning id into v_sol;
  return v_sol;
end $$;
revoke execute on function public.solicitar_evento from public, anon;
grant  execute on function public.solicitar_evento to authenticated;

-- A fila passa a trazer o espaço (coluna nova no fim, como o Postgres exige)
create or replace view public.fila_solicitacoes with (security_invoker = true) as
  select s.*, e.titulo, e.tipo, e.data_inicio, e.data_fim, e.hora_inicio, e.hora_fim,
         e.local_id, e.qtd_pessoas, e.status, p.nome as solicitante_nome,
         e.observacao, l.nome as local_nome, r.nome as revisor_nome,
         e.espaco
  from public.solicitacoes s
  join public.eventos e on e.id = s.evento_id
  join public.perfis  p on p.id = s.solicitante_id
  left join public.locais l on l.id = e.local_id
  left join public.perfis r on r.id = s.revisado_por;
