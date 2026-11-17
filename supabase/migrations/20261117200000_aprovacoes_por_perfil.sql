-- =====================================================================
-- Issue #5 — Ajuste na Tela de Aprovações
--
-- 1) User só vê as PRÓPRIAS solicitações: já garantido pelo RLS
--    (política sol_select: solicitante_id = auth.uid() ou admin) e pela
--    view fila_solicitacoes, que é security_invoker. Nada a mudar aqui.
--
-- 2) Evento criado por Admin não passa pela fila: o app já grava direto
--    em eventos com status 'aprovado'. Aqui fechamos o caminho pela API:
--    solicitar_evento passa a recusar administradores, então nenhuma
--    solicitação de Admin entra na fila, nem chamando o banco direto.
-- =====================================================================
create or replace function public.solicitar_evento(
  p_titulo text, p_tipo text, p_data_inicio date,
  p_data_fim date default null, p_hora_inicio time default null, p_hora_fim time default null,
  p_local_id uuid default null, p_qtd_pessoas int default null,
  p_descricao text default null, p_mensagem text default null, p_observacao text default null
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
                              local_id, qtd_pessoas, descricao, observacao, status, criado_por)
  values (trim(p_titulo), p_tipo, p_data_inicio, p_data_fim, p_hora_inicio, p_hora_fim,
          p_local_id, p_qtd_pessoas, p_descricao, nullif(trim(p_observacao), ''), 'pendente', auth.uid())
  returning id into v_evento;

  insert into public.solicitacoes (evento_id, solicitante_id, mensagem)
  values (v_evento, auth.uid(), nullif(trim(p_mensagem), ''))
  returning id into v_sol;
  return v_sol;
end $$;
revoke execute on function public.solicitar_evento from public, anon;
grant  execute on function public.solicitar_evento to authenticated;
