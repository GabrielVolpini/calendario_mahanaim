-- Ajustes apontados pelo Security Advisor do Supabase

-- search_path fixo nas funções auxiliares
alter function public.set_atualizado_em() set search_path = '';
alter function public.data_pascoa(int)    set search_path = '';

-- handle_new_user só roda como trigger; não deve ser chamável pela API
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_admin é usada nas políticas RLS (precisa de execute para quem está logado),
-- mas visitantes sem login não precisam dela
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;
