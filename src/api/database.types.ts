// =====================================================================
// Tipos do banco, gerados a partir do Supabase (generate_typescript_types).
// Não editar à mão: quando o banco mudar, gere de novo com
//   npx supabase gen types typescript --project-id dwqnsedxxbvxlcswxqnh > src/api/database.types.ts
// =====================================================================
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      campanhas: {
        Row: { ano: number; cor: string; descricao: string | null; mes: number; nome: string };
        Insert: { ano: number; cor?: string; descricao?: string | null; mes: number; nome: string };
        Update: { ano?: number; cor?: string; descricao?: string | null; mes?: number; nome?: string };
        Relationships: [];
      };
      eventos: {
        Row: {
          atualizado_em: string; atualizado_por: string | null; criado_em: string; criado_por: string | null;
          data_fim: string | null; data_inicio: string; descricao: string | null; espaco: string | null; feriado_id: string | null;
          hora_fim: string | null; hora_inicio: string | null; id: string; local_id: string | null;
          observacao: string | null; qtd_pessoas: number | null; serie_id: string | null;
          status: Database['public']['Enums']['status_evento']; tipo: string; titulo: string;
        };
        Insert: {
          atualizado_em?: string; atualizado_por?: string | null; criado_em?: string; criado_por?: string | null;
          data_fim?: string | null; data_inicio: string; descricao?: string | null; espaco?: string | null; feriado_id?: string | null;
          hora_fim?: string | null; hora_inicio?: string | null; id?: string; local_id?: string | null;
          observacao?: string | null; qtd_pessoas?: number | null; serie_id?: string | null;
          status?: Database['public']['Enums']['status_evento']; tipo: string; titulo: string;
        };
        Update: {
          atualizado_em?: string; atualizado_por?: string | null; criado_em?: string; criado_por?: string | null;
          data_fim?: string | null; data_inicio?: string; descricao?: string | null; espaco?: string | null; feriado_id?: string | null;
          hora_fim?: string | null; hora_inicio?: string | null; id?: string; local_id?: string | null;
          observacao?: string | null; qtd_pessoas?: number | null; serie_id?: string | null;
          status?: Database['public']['Enums']['status_evento']; tipo?: string; titulo?: string;
        };
        Relationships: [
          { foreignKeyName: 'eventos_atualizado_por_fkey'; columns: ['atualizado_por']; isOneToOne: false; referencedRelation: 'perfis'; referencedColumns: ['id'] },
          { foreignKeyName: 'eventos_criado_por_fkey'; columns: ['criado_por']; isOneToOne: false; referencedRelation: 'perfis'; referencedColumns: ['id'] },
          { foreignKeyName: 'eventos_feriado_id_fkey'; columns: ['feriado_id']; isOneToOne: false; referencedRelation: 'feriados_base'; referencedColumns: ['id'] },
          { foreignKeyName: 'eventos_local_id_fkey'; columns: ['local_id']; isOneToOne: false; referencedRelation: 'locais'; referencedColumns: ['id'] },
          { foreignKeyName: 'eventos_serie_id_fkey'; columns: ['serie_id']; isOneToOne: false; referencedRelation: 'series'; referencedColumns: ['id'] },
          { foreignKeyName: 'eventos_tipo_fkey'; columns: ['tipo']; isOneToOne: false; referencedRelation: 'tipos_evento'; referencedColumns: ['slug'] },
        ];
      };
      feriados_base: {
        Row: {
          abrangencia: string; ativo: boolean; dia: number | null; dias_apos_pascoa: number | null;
          id: string; mes: number | null; nome: string; observacao: string | null; regra: string;
        };
        Insert: {
          abrangencia?: string; ativo?: boolean; dia?: number | null; dias_apos_pascoa?: number | null;
          id?: string; mes?: number | null; nome: string; observacao?: string | null; regra: string;
        };
        Update: {
          abrangencia?: string; ativo?: boolean; dia?: number | null; dias_apos_pascoa?: number | null;
          id?: string; mes?: number | null; nome?: string; observacao?: string | null; regra?: string;
        };
        Relationships: [];
      };
      locais: {
        Row: { ativo: boolean; id: string; nome: string };
        Insert: { ativo?: boolean; id?: string; nome: string };
        Update: { ativo?: boolean; id?: string; nome?: string };
        Relationships: [];
      };
      perfis: {
        Row: {
          ativo: boolean; atualizado_em: string; criado_em: string; email: string; id: string; nome: string;
          perfil: Database['public']['Enums']['perfil_usuario']; senha_provisoria: boolean;
        };
        Insert: {
          ativo?: boolean; atualizado_em?: string; criado_em?: string; email: string; id: string; nome: string;
          perfil?: Database['public']['Enums']['perfil_usuario']; senha_provisoria?: boolean;
        };
        Update: {
          ativo?: boolean; atualizado_em?: string; criado_em?: string; email?: string; id?: string; nome?: string;
          perfil?: Database['public']['Enums']['perfil_usuario']; senha_provisoria?: boolean;
        };
        Relationships: [];
      };
      series: {
        Row: { criado_em: string; criado_por: string | null; id: string; regra: string | null; titulo: string };
        Insert: { criado_em?: string; criado_por?: string | null; id?: string; regra?: string | null; titulo: string };
        Update: { criado_em?: string; criado_por?: string | null; id?: string; regra?: string | null; titulo?: string };
        Relationships: [
          { foreignKeyName: 'series_criado_por_fkey'; columns: ['criado_por']; isOneToOne: false; referencedRelation: 'perfis'; referencedColumns: ['id'] },
        ];
      };
      solicitacoes: {
        Row: {
          criado_em: string; evento_id: string; id: string; mensagem: string | null; motivo_recusa: string | null;
          revisado_em: string | null; revisado_por: string | null; solicitante_id: string;
        };
        Insert: {
          criado_em?: string; evento_id: string; id?: string; mensagem?: string | null; motivo_recusa?: string | null;
          revisado_em?: string | null; revisado_por?: string | null; solicitante_id: string;
        };
        Update: {
          criado_em?: string; evento_id?: string; id?: string; mensagem?: string | null; motivo_recusa?: string | null;
          revisado_em?: string | null; revisado_por?: string | null; solicitante_id?: string;
        };
        Relationships: [
          { foreignKeyName: 'solicitacoes_evento_id_fkey'; columns: ['evento_id']; isOneToOne: true; referencedRelation: 'eventos'; referencedColumns: ['id'] },
          { foreignKeyName: 'solicitacoes_revisado_por_fkey'; columns: ['revisado_por']; isOneToOne: false; referencedRelation: 'perfis'; referencedColumns: ['id'] },
          { foreignKeyName: 'solicitacoes_solicitante_id_fkey'; columns: ['solicitante_id']; isOneToOne: false; referencedRelation: 'perfis'; referencedColumns: ['id'] },
        ];
      };
      tipos_evento: {
        Row: { cor: string; nome: string; ordem: number; slug: string };
        Insert: { cor: string; nome: string; ordem?: number; slug: string };
        Update: { cor?: string; nome?: string; ordem?: number; slug?: string };
        Relationships: [];
      };
    };
    Views: {
      fila_solicitacoes: {
        Row: {
          criado_em: string | null; data_fim: string | null; data_inicio: string | null; espaco: string | null; evento_id: string | null;
          hora_fim: string | null; hora_inicio: string | null; id: string | null; local_id: string | null;
          local_nome: string | null; mensagem: string | null; motivo_recusa: string | null; observacao: string | null;
          qtd_pessoas: number | null; revisado_em: string | null; revisado_por: string | null; revisor_nome: string | null;
          solicitante_id: string | null; solicitante_nome: string | null;
          status: Database['public']['Enums']['status_evento'] | null; tipo: string | null; titulo: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      aprovar_solicitacao: { Args: { p_id: string }; Returns: undefined };
      cancelar_solicitacao: { Args: { p_id: string }; Returns: undefined };
      concluir_troca_senha: { Args: never; Returns: undefined };
      data_pascoa: { Args: { ano: number }; Returns: string };
      gerar_feriados: { Args: { p_ano: number }; Returns: number };
      is_admin: { Args: never; Returns: boolean };
      recusar_solicitacao: { Args: { p_id: string; p_motivo?: string }; Returns: undefined };
      solicitar_evento: {
        Args: {
          p_data_fim?: string; p_data_inicio: string; p_descricao?: string; p_espaco?: string; p_hora_fim?: string; p_hora_inicio?: string;
          p_local_id?: string; p_mensagem?: string; p_observacao?: string; p_qtd_pessoas?: number;
          p_tipo: string; p_titulo: string;
        };
        Returns: string;
      };
    };
    Enums: {
      perfil_usuario: 'admin' | 'user';
      status_evento: 'pendente' | 'aprovado' | 'recusado' | 'cancelado';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
