// Ponto único de troca da implementação da API.
//   - Com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local → banco real (Supabase).
//   - Sem elas → protótipo com dados de exemplo no localStorage (mock).
// O resto do app não muda: tudo fala com `api` pelo contrato CalendarApi.
import type { CalendarApi } from './contract';
import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** true quando o app está rodando sem banco (dados de exemplo no navegador). */
export const MODO_DEMO = !(url && chave);

export const api: CalendarApi = url && chave ? createSupabaseApi(url, chave) : createMockApi();
export { ApiError, isApiError, mensagemDoErro } from './errors';
