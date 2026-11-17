-- =====================================================================
-- A Edge Function criar-usuario usa a chave de serviço (service_role)
-- para gravar nome e perfil do novo acesso. Neste projeto nem o
-- service_role recebe GRANT automático, então o UPDATE em perfis falhava
-- com "permission denied" e o acesso ficava sempre como 'user'.
-- Concede só o necessário.
-- =====================================================================
revoke truncate, trigger, references on all tables in schema public from service_role;
grant select, update on public.perfis to service_role;
