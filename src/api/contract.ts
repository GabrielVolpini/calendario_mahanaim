// =====================================================================
// CONTRATO DA API
// Tudo o que a tela pode pedir ao "servidor". Hoje existe uma
// implementação simulada (mock.ts). Na fase de banco, basta criar outra
// implementação desta mesma interface (ex.: supabase.ts) e trocar em index.ts.
// O TypeScript garante que nada fique faltando.
// =====================================================================
import type {
  AnoMes, Campanhas, Escopo, Evento, EventoDados, Solicitacao, SolicitacaoView, Usuario,
} from '../domain/types';
import type { AtualizarUsuarioInput, CampanhaInput, NovoUsuarioInput, TrocaSenhaInput } from '../domain/schemas';

export interface CalendarApi {
  // Autenticação
  login(email: string, senha: string, lembrar: boolean): Promise<Usuario>;
  logout(): Promise<void>;
  me(): Promise<Usuario | null>;
  /** Primeiro acesso: troca a senha provisória pela definitiva. */
  changePassword(dados: TrocaSenhaInput): Promise<Usuario>;

  // Eventos (gravar e excluir: só admin)
  listEvents(): Promise<Evento[]>;
  createEvent(dados: EventoDados): Promise<Evento>;
  updateEvent(id: string, dados: EventoDados, escopo: Escopo): Promise<Evento>;
  deleteEvent(id: string, escopo: Escopo): Promise<void>;

  // Solicitações (criar/cancelar: qualquer usuário; aprovar/recusar: só admin)
  listRequests(): Promise<SolicitacaoView[]>;
  createRequest(evento: EventoDados, mensagem?: string): Promise<Solicitacao>;
  cancelRequest(id: string): Promise<void>;
  approveRequest(id: string, eventoAjustado?: EventoDados): Promise<Solicitacao>;
  rejectRequest(id: string, motivo?: string): Promise<Solicitacao>;

  // Campanhas do mês (gravar: só admin)
  listCampaigns(): Promise<Campanhas>;
  saveCampaign(mes: AnoMes, campanha: CampanhaInput | null): Promise<Campanhas>;

  // Usuários (só admin)
  listUsers(): Promise<Usuario[]>;
  createUser(dados: NovoUsuarioInput): Promise<Usuario>;
  updateUser(dados: AtualizarUsuarioInput): Promise<Usuario>;
  /** Exclui o acesso de vez (no Supabase: apaga do Auth). Ninguém exclui o próprio acesso. */
  deleteUser(id: string): Promise<void>;

  // Somente no protótipo
  resetDemo(): Promise<void>;
}
