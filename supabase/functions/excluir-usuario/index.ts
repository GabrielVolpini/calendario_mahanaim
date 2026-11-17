// =====================================================================
// Edge Function: excluir-usuario
// Apagar um acesso do Supabase Auth exige a chave de serviço, que NUNCA
// pode ir para o navegador. Por isso o app chama esta função, que:
//   1) confere que quem chamou está logado e é admin ativo;
//   2) impede que o admin exclua o próprio acesso;
//   3) apaga o usuário no Auth. O perfil some junto (on delete cascade);
//      eventos criados por ele ficam, sem autor; os pedidos dele somem.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const { data: { user: quem } } = await comoUsuario.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!quem) return responder(401, { codigo: 'NAO_AUTENTICADO', erro: 'Sua sessão expirou. Entre novamente.' });

  // 2) Validação
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return responder(400, { codigo: 'VALIDACAO', erro: 'Dados inválidos.' }); }
  const id = String(corpo.id ?? '');
  if (!UUID.test(id)) return responder(400, { codigo: 'VALIDACAO', erro: 'Usuário inválido.' });
  if (id === quem.id) return responder(409, { codigo: 'CONFLITO', erro: 'Você não pode excluir o seu próprio acesso.' });

  // 3) Exclui no Auth (o perfil vai junto pelo on delete cascade)
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    const naoExiste = error.status === 404 || /not.?found/i.test(error.message);
    if (!naoExiste) console.error('excluir-usuario:', error.message);
    return responder(naoExiste ? 404 : 500, {
      codigo: naoExiste ? 'NAO_ENCONTRADO' : 'VALIDACAO',
      erro: naoExiste ? 'Usuário não encontrado.' : 'Não foi possível excluir o acesso. Tente de novo.',
    });
  }
  return responder(200, { ok: true });
});
