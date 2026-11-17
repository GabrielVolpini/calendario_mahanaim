// =====================================================================
// Edge Function: criar-usuario
// Criar acesso (e-mail + senha) exige a chave de serviço, que NUNCA pode
// ir para o navegador. Por isso o app chama esta função, que:
//   1) confere que quem chamou está logado e é admin ativo;
//   2) valida os dados;
//   3) cria o usuário no Supabase Auth (a senha vira hash lá);
//   4) define o perfil (admin/user) na tabela perfis.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SEGURO = /^[^\u0000-\u001F\u007F<>]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { codigo: 'VALIDACAO', erro: 'Método não permitido.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Quem está chamando? (usa o token do próprio usuário, respeitando RLS)
  const authHeader = req.headers.get('Authorization') ?? '';
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: eAdmin, error: erroAdmin } = await comoUsuario.rpc('is_admin');
  if (erroAdmin) return responder(401, { codigo: 'NAO_AUTENTICADO', erro: 'Sua sessão expirou. Entre novamente.' });
  if (!eAdmin) return responder(403, { codigo: 'SEM_PERMISSAO', erro: 'Acesso restrito a administradores.' });

  // 2) Validação (as mesmas regras de src/domain/schemas.ts)
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return responder(400, { codigo: 'VALIDACAO', erro: 'Dados inválidos.' }); }
  const nome = String(corpo.nome ?? '').trim();
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  const perfil = corpo.perfil === 'admin' ? 'admin' : corpo.perfil === 'user' ? 'user' : null;

  if (!nome || nome.length > 60 || !SEGURO.test(nome)) return responder(400, { codigo: 'VALIDACAO', erro: 'Informe um nome válido (até 60 caracteres).' });
  if (!EMAIL.test(email) || email.length > 120) return responder(400, { codigo: 'VALIDACAO', erro: 'Informe um e-mail válido.' });
  if (senha.length < 8 || senha.length > 72 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha))
    return responder(400, { codigo: 'VALIDACAO', erro: 'A senha precisa ter de 8 a 72 caracteres, com letra e número.' });
  if (!perfil) return responder(400, { codigo: 'VALIDACAO', erro: 'Perfil inválido.' });

  // 3) Cria no Auth (o gatilho handle_new_user cria a linha em perfis)
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { nome },
  });
  if (erroCriar || !criado.user) {
    const jaExiste = /already|registered|exists/i.test(erroCriar?.message ?? '');
    return responder(jaExiste ? 409 : 400, {
      codigo: jaExiste ? 'CONFLITO' : 'VALIDACAO',
      erro: jaExiste ? 'Já existe um acesso com este e-mail.' : 'Não foi possível criar o acesso.',
    });
  }

  // 4) Perfil
  const { data: p, error: erroPerfil } = await admin
    .from('perfis').update({ nome, perfil }).eq('id', criado.user.id)
    .select('id, nome, email, perfil, ativo').single();
  if (erroPerfil) {
    // Desfaz a criação: não deixar um acesso "pela metade" (ex.: sem o perfil admin pedido)
    console.error('criar-usuario: falha ao salvar perfil', erroPerfil.message);
    await admin.auth.admin.deleteUser(criado.user.id);
    return responder(500, { codigo: 'VALIDACAO', erro: 'Não foi possível salvar o perfil. O acesso não foi criado; tente de novo.' });
  }

  return responder(200, { usuario: p });
});
