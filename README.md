# Calendário Mahanaim

Calendário da liderança da Igreja Internacional Mahanaim.
Feito em **TypeScript** (com **Vite** e **Zod** para as validações).
Os dados ficam no **Supabase** (Postgres + Auth). Sem configuração, o app roda no
**modo protótipo**, com dados de exemplo no `localStorage`.

## Como rodar

Requisito: Node.js 20 ou mais novo.

```bash
npm install
```

```bash
npm run dev
```

Depois acesse http://127.0.0.1:5173.

### Conectar ao Supabase

Copie `.env.example` para `.env.local` e preencha a URL e a chave **publishable**
(Painel → Project Settings → API Keys). Com isso o app usa o banco real; sem isso, o modo protótipo.
A chave publishable pode ir para o navegador: quem protege os dados é o RLS do banco.
**Nunca** coloque a chave `service_role`/secret no `.env.local`.

O primeiro admin é criado no painel (Authentication → Users → Add user) e promovido com:

```sql
update public.perfis set perfil = 'admin' where email = 'seu-email@exemplo.com';
```

Os próximos acessos o admin cria pela própria tela de Usuários
(Edge Function `criar-usuario`).

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (recarrega sozinho) |
| `npm run typecheck` | confere os tipos do código inteiro |
| `npm run build` | confere os tipos e gera o site final em `dist/` |
| `npm run preview` | abre o site gerado em `dist/` |

### Acessos de demonstração (só no modo protótipo)

| Perfil | E-mail | Senha |
|---|---|---|
| Admin | admin@mahanaim.demo | admin123 |
| User | membro@mahanaim.demo | membro123 |
| User | louvor@mahanaim.demo | louvor123 |

No menu do Admin, **Restaurar dados de exemplo** volta tudo ao estado inicial.

## O que o app faz

- **Login com e-mail e senha** e opção **Lembrar de mim por 30 dias**
  (marcado: sessão de 30 dias; desmarcado: sessão até fechar o navegador).
- **User (visualização)**: vê o calendário, envia **solicitações de evento**
  e acompanha em *Minhas solicitações*. O pedido aparece tracejado só para o autor e os admins.
- **Admin**: cria, edita e exclui eventos (inclusive de vários dias e séries de cultos),
  aprova, ajusta ou recusa solicitações, gerencia usuários e a campanha do mês.

## Estrutura

```
index.html              telas e diálogos
src/main.ts             lógica da tela (só fala com `api`)
src/styles.css          visual (claro/escuro, responsivo)
src/domain/types.ts     tipos do domínio (Evento, Usuario, Solicitacao...)
src/domain/schemas.ts   validações com Zod (reaproveitáveis no servidor)
src/api/contract.ts     interface CalendarApi = contrato do backend
src/api/mock.ts         implementação simulada (localStorage)
src/api/supabase.ts     implementação real (Supabase) + conversões app ↔ banco
src/api/database.types.ts  tipos gerados a partir do banco
src/api/index.ts        escolhe a implementação (Supabase se houver .env.local)
supabase/migrations/    estrutura, carga inicial, ajustes e permissões do banco
supabase/functions/     Edge Function criar-usuario (usa a chave de serviço no servidor)
scripts/gerar-carga-inicial.ts  gera a migração de carga a partir de src/data/seed.ts
src/api/errors.ts       erros com código (NAO_AUTENTICADO, SEM_PERMISSAO...)
src/data/seed.ts        dados iniciais (vira a carga inicial do banco)
src/ui/dom.ts           HTML seguro (escape automático)
src/ui/format.ts        datas e horários
```

## Segurança já aplicada

- **TypeScript no modo mais rigoroso** (`strict`, `noUncheckedIndexedAccess` e outros):
  o build falha se algum tipo não bater.
- **Validação de dados com Zod** em toda entrada, na tela (resposta imediata) e de novo na API:
  - títulos, locais e mensagens com limite de tamanho e sem `<`, `>` ou caracteres de controle;
  - datas reais entre 2020 e 2100, data final depois da inicial, no máximo 31 dias;
  - horário no formato da igreja (`10h`, `18h30`);
  - e-mail válido; senha nova com 8 a 72 caracteres, letra e número;
  - **campos extras são recusados**: ninguém consegue enviar `id`, `status` ou `serie` por conta própria.
- **HTML seguro por padrão**: todo texto vai para a tela pelo template `html`, que escapa os valores.
  Só `setHtml()` escreve `innerHTML`.
- **Permissões na API**: só Admin grava eventos, aprova pedidos e gerencia usuários;
  um Admin não pode remover o próprio acesso.
- **Login**: mesma mensagem para e-mail inexistente e senha errada;
  **bloqueio de 5 minutos após 5 tentativas erradas**.
- **Limite de 10 solicitações pendentes** por pessoa.
- Dados lidos do armazenamento local também passam por validação antes de serem usados.

## Banco de dados (Supabase)

- **Carga inicial**: cultos (11 séries), eventos especiais, aniversários, datas comemorativas e
  campanhas do protótipo foram migrados (`..._carga_inicial.sql`). Feriados são gerados pelo banco
  com `gerar_feriados(ano)`. Usuários e solicitações de demonstração **não** foram migrados.
- **Permissões**: GRANT só para usuários logados + RLS (todos leem; só admin grava).
  Usuário comum cria/cancela pedidos pelas funções `solicitar_evento` e `cancelar_solicitacao`.
- Categorias da tela ↔ tipos do banco: `evento` = `especial`/`conferencia`/`reuniao`,
  `aniv` = `aniversario`, `data` = `data_comemorativa`.
- Pendências: "Esqueci a senha" por e-mail; sessão de 30 dias configurada no painel do Auth;
  bloquear no RLS usuários marcados como inativos.
