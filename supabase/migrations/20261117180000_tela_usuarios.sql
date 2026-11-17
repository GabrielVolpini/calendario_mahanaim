-- =====================================================================
-- Tela de Usuários (issue #3)
--   1) Senha provisória: todo acesso novo nasce com senha_provisoria = true.
--      No primeiro login o app obriga a troca (nova senha + confirmação) e
--      chama concluir_troca_senha(). A senha em si NUNCA é guardada aqui:
--      ela fica só como hash no Supabase Auth.
--   2) Exclusão: feita pela Edge Function excluir-usuario (chave de serviço).
--      Apagar o usuário no Auth apaga o perfil (on delete cascade).
-- =====================================================================

-- Quem já existe não precisa trocar; quem for criado daqui em diante sim.
alter table public.perfis add column senha_provisoria boolean not null default false;
alter table public.perfis alter column senha_provisoria set default true;

comment on column public.perfis.senha_provisoria is
  'true até a pessoa trocar a senha provisória no primeiro acesso. Não guarda a senha.';

-- A própria pessoa marca que já trocou a senha (o RLS de perfis só deixa admin gravar).
create or replace function public.concluir_troca_senha()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login para trocar a senha.'; end if;
  update public.perfis set senha_provisoria = false where id = auth.uid() and ativo;
end $$;
revoke execute on function public.concluir_troca_senha() from public, anon;
grant  execute on function public.concluir_troca_senha() to authenticated;

-- Admin não pode "desmarcar" a senha provisória de alguém pela API:
-- só a própria pessoa, pela função acima.
create or replace function public.proteger_perfis()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.email <> old.email then
    raise exception 'O e-mail é alterado pelo cadastro de acesso, não por aqui.';
  end if;
  if old.id = auth.uid() and old.perfil = 'admin' and (new.perfil <> 'admin' or not new.ativo) then
    raise exception 'Você não pode remover o seu próprio acesso de administrador.';
  end if;
  if new.senha_provisoria is distinct from old.senha_provisoria
     and current_user = 'authenticated' and old.id <> auth.uid() then
    raise exception 'A senha provisória só é trocada pela própria pessoa.';
  end if;
  return new;
end $$;
