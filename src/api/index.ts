// Ponto único de troca da implementação da API.
//   - Com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local → banco real (Supabase).
//   - Sem elas, rodando `npm run dev` → protótipo com dados de exemplo no localStorage (mock).
//   - Sem elas no site publicado (build) → o app NÃO usa dados de exemplo: avisa que falta configuração.
// O resto do app não muda: tudo fala com `api` pelo contrato CalendarApi.
import type { CalendarApi } from './contract';
import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const temBanco = !!(url && chave);

/** true quando o app está rodando sem banco (dados de exemplo no navegador) — só em desenvolvimento. */
export const MODO_DEMO = !temBanco && import.meta.env.DEV;

/** true no site publicado sem VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. */
export const BANCO_NAO_CONFIGURADO = !temBanco && !import.meta.env.DEV;

export const api: CalendarApi = url && chave ? createSupabaseApi(url, chave) : createMockApi();
export { ApiError, isApiError, mensagemDoErro } from './errors';
