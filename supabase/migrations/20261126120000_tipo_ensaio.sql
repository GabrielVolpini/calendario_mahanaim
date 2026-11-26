-- =====================================================================
-- Novo tipo de evento: Ensaio.
-- "Reunião" (reuniao) já existia desde a estrutura inicial; agora os dois
-- ganham categoria própria no app, com cor e filtro na legenda.
-- =====================================================================
insert into public.tipos_evento (slug, nome, cor, ordem) values
  ('ensaio', 'Ensaio', 'ciano', 8)
on conflict (slug) do nothing;
