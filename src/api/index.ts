// Ponto único de troca: quando o banco estiver pronto, troque createMockApi()
// pela implementação real (ex.: createSupabaseApi()). O resto do app não muda.
import type { CalendarApi } from './contract';
import { createMockApi } from './mock';

export const api: CalendarApi = createMockApi();
export { ApiError, isApiError, mensagemDoErro } from './errors';
