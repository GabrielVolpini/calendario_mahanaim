-- =====================================================================
-- Permissões da API (PostgREST)
-- Neste projeto as tabelas novas NÃO recebem GRANT automático para os
-- papéis da API. Sem isto, mesmo com as políticas RLS, o app recebe
-- "permission denied". Os GRANTs abrem a porta; o RLS decide QUEM passa.
-- =====================================================================

-- Limpeza: TRUNCATE ignora o RLS e não é usado pelo app
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Visitante sem login (anon): nada. Usuário logado:
grant select on public.perfis, public.tipos_evento, public.locais, public.series,
                public.feriados_base, public.eventos, public.solicitacoes,
                public.campanhas, public.fila_solicitacoes
  to authenticated;

-- Escrita (o RLS só deixa passar admin; usuário comum usa as funções RPC)
grant insert, update, delete on public.eventos, public.campanhas, public.series,
                                public.locais, public.tipos_evento, public.feriados_base
  to authenticated;
grant update on public.perfis to authenticated;
