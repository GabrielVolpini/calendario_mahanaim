-- =====================================================================
-- Usuário desativado perde o acesso também no BANCO, não só no app.
-- Antes: as políticas de leitura liberavam qualquer usuário logado, então
-- quem tinha um token ainda válido (até ~1h) conseguia ler o calendário
-- chamando a API direto. Agora toda leitura exige perfil ativo.
--
-- Gravações já estavam protegidas: is_admin() exige ativo e
-- solicitar_evento confere ativo. Falta só cancelar_solicitacao (abaixo).
-- =====================================================================

-- Helper: o usuário logado tem perfil ativo?
create or replace function public.is_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;
revoke execute on function public.is_ativo() from public, anon;
grant  execute on function public.is_ativo() to authenticated;

-- (select ...) faz o Postgres avaliar a função uma vez por consulta, não por linha.
alter policy camp_select     on public.campanhas     using ((select public.is_ativo()));
alter policy feriados_select on public.feriados_base using ((select public.is_ativo()));
alter policy locais_select   on public.locais        using ((select public.is_ativo()));
alter policy series_select   on public.series        using ((select public.is_ativo()));
alter policy tipos_select    on public.tipos_evento  using ((select public.is_ativo()));

alter policy eventos_select on public.eventos using (
  (select public.is_ativo())
  and (status = 'aprovado' or criado_por = (select auth.uid()) or (select public.is_admin()))
);
alter policy sol_select on public.solicitacoes using (
  (select public.is_ativo())
  and (solicitante_id = (select auth.uid()) or (select public.is_admin()))
);
-- perfis_select continua deixando cada um ler o PRÓPRIO perfil (mesmo inativo):
-- é assim que o app descobre que o acesso foi desativado e mostra o aviso.
-- Ler os perfis dos outros já exige is_admin(), que exige ativo.

-- Cancelar pedido também exige perfil ativo
create or replace function public.cancelar_solicitacao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_evento uuid;
begin
  if not (select public.is_ativo()) then raise exception 'Este acesso está desativado. Fale com a liderança.'; end if;
  select s.evento_id into v_evento from public.solicitacoes s
    join public.eventos e on e.id = s.evento_id
    where s.id = p_id and s.solicitante_id = auth.uid() and e.status = 'pendente' for update;
  if v_evento is null then raise exception 'Solicitação não encontrada.'; end if;
  update public.eventos set status = 'cancelado' where id = v_evento;
end $$;
