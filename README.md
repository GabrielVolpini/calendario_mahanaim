# Calendário Mahanaim

Calendário da liderança da Igreja Internacional Mahanaim.
Feito em **TypeScript** (com **Vite** e **Zod** para as validações).
Ainda **sem banco de dados**: os dados ficam no `localStorage` do navegador,
através de uma API simulada que já define o contrato do futuro backend.

## Como rodar

Requisito: Node.js 20 ou mais novo.

```bash
npm install
```

```bash
npm run dev
```

Depois acesse http://127.0.0.1:5173.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (recarrega sozinho) |
| `npm run typecheck` | confere os tipos do código inteiro |
| `npm run build` | confere os tipos e gera o site final em `dist/` |
| `npm run preview` | abre o site gerado em `dist/` |

### Acessos de demonstração

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
src/api/index.ts        escolhe qual implementação o app usa
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

## Próxima fase: banco de dados

Criar uma nova implementação de `CalendarApi` (ex.: `src/api/supabase.ts`) e trocá-la em
`src/api/index.ts`. O TypeScript aponta qualquer método que ficar faltando.

No backend, repetir as mesmas regras (os esquemas de `schemas.ts` podem ser reaproveitados):

- permissões no servidor (ex.: Row Level Security no Supabase);
- senhas só como hash (o Supabase Auth já faz isso);
- "lembrar de mim" com sessão do provedor de autenticação, em vez de `localStorage`;
- limite de tentativas de login no servidor;
- "Esqueci a senha" (envio de e-mail).
