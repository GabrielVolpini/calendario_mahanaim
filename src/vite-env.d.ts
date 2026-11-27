/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase, ex.: https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave pública (publishable). Pode ir para o navegador: quem protege os dados é o RLS. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
