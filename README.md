# Calendário Mahanaim

Gestão da liderança da Igreja Internacional Mahanaim (calendário, solicitações, atas e usuários).
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
(Painel → Project Settings → API Keys). Com isso o app usa o banco real; sem isso, o `npm run dev` abre o modo protótipo.

Na **Vercel**, cadastre as mesmas duas variáveis em Project Settings → Environment Variables
e faça um novo deploy. Sem elas, o site publicado não abre o protótipo: a tela de login avisa
que falta a configuração do banco.
A chave publishable pode ir para o navegador: quem protege os dados é o RLS do banco.
**Nunca** coloque a chave `service_role`/secret no `.env.local`.

O primeiro admin é criado no painel (Authentication → Users → Add user) e promovido com:

```sql
update public.perfis set perfil = 'admin' where email = 'seu-email@exemplo.com';
```

Os próximos acessos o admin cria pela tela de **Usuários** (`/users`),
que usa as Edge Functions `criar-usuario` e `excluir-usuario`.

> **Hospedagem:** as telas de solicitações, usuários e atas têm rota própria (`/solicitacoes`, `/users`, `/atas`). No `npm run dev` isso já funciona;
> ao publicar o `dist/`, configure o servidor para devolver o `index.html` em qualquer caminho
> (ex.: *rewrite* `/* → /index.html`). Na Vercel isso já está no `vercel.json`; arquivos que existem (como `/assets/...` e o logo) continuam sendo servidos normalmente.

### App no celular (PWA)

O site também é um **app instalável** no Android e no iPhone (gerado pelo `vite-plugin-pwa` no `npm run build`).

- **Android (Chrome/Edge):** aparece o botão **Instalar app** (no menu lateral e na tela de login), que abre o pedido de instalação do navegador.
- **iPhone/iPad:** o mesmo botão abre o passo a passo: **Compartilhar → Adicionar à Tela de Início** (no Safari).
- Só funciona em **HTTPS** (a Vercel já serve assim). No `npm run dev` o service worker fica desligado; para testar, use `npm run build` e `npm run preview`.
- Os dados do Supabase **não** ficam em cache: sempre vêm do banco. Fica guardada só a interface do app.
- Quando sai uma versão nova, o app mostra **"Nova versão do app disponível"** e só recarrega quando a pessoa toca em Atualizar.
- Ícones: troque `public/logo-mahanaim.jpg` e rode `node scripts/gerar-icones.ts` (saem em `public/icons/`).

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (recarrega sozinho) |
| `npm run typecheck` | confere os tipos do código inteiro |
| `npm run build` | confere os tipos e gera o site final em `dist/` |
| `npm run preview` | abre o site gerado em `dist/` |

### Acessos de demonstração (só no modo protótipo, em `npm run dev` sem `.env.local`)

Digite-os na tela de login:

| Perfil | E-mail | Senha |
|---|---|---|
| Admin | admin@mahanaim.demo | admin123 |
| User | membro@mahanaim.demo | membro123 |
| User | louvor@mahanaim.demo | louvor123 |

No menu do Admin, **Restaurar dados de exemplo** volta tudo ao estado inicial.

## O que o app faz

- **Visual da igreja** (proposta em [`docs/redesign`](docs/redesign/README.md)): cores tiradas do logo
  (azul-marinho, rosa-claro e o degradê do anel), logo oficial no menu, no login e no ícone da aba.
- **Menu lateral** com Calendário, Solicitações, Atas de reunião e Usuários (só Admin).
  No computador recolhe para só ícones (botão *Recolher menu*, a escolha fica salva); no celular vira gaveta (☰).
- **Tema claro ou escuro**, escolhido no rodapé do menu e salvo no navegador (sem escolha salva, abre no claro).
- **Painel do calendário**: minicalendário, filtros por tipo de evento (com a quantidade no mês) e a campanha do mês.
  No tablet e no celular abre pelo botão *Filtros*.
- **Barra de período**: Mês, Semana, Dia e Ano + botão **Calendário / Lista** (a lista vale para o período escolhido).
- **Busca** no topo por título ou local; mostra os próximos primeiro.
- **Celular**: os nomes dos eventos aparecem pequenos na grade do mês (nome curto, ex.: *Família*, *Confrat.*);
  tocar num dia seleciona e mostra a agenda dele embaixo da grade.
- **Login com e-mail e senha** e opção **Lembrar de mim por 30 dias**
  (marcado: sessão de 30 dias; desmarcado: sessão até fechar o navegador).
- **User (visualização)**: vê o calendário, envia **solicitações de evento**
  e acompanha em *Minhas solicitações*. O pedido aparece tracejado só para o autor e os admins.
- **Admin**: cria, edita e exclui eventos (inclusive de vários dias e séries de cultos),
  aprova, ajusta ou recusa solicitações (tela `/solicitacoes`), gerencia usuários e a campanha do mês.
- **Tela de Usuários** (`/users`, só Admin; o botão nem aparece para User):
  - lista nome, e-mail, situação da senha provisória e perfil de cada pessoa;
  - **+ Novo usuário** (no cabeçalho da tela) abre o pop-up de criação, com gerador de senha provisória.
    A senha aparece **uma única vez**, com botão *Copiar acesso*, e **não fica salva** em lugar nenhum
    (o Supabase guarda só o hash). Na lista ela aparece como `••••••••` + "Aguardando 1º acesso" ou "Já acessou";
  - trocar perfil, desativar/reativar e **excluir** (dupla validação: confirmar e depois digitar o e-mail
    da pessoa). Excluir apaga o acesso do Supabase Auth; ninguém exclui o próprio acesso.
- **Atas de reunião** (`/atas`, item *Atas de reunião* do menu):
  - bloco de notas das reuniões: título, data, participantes, **resumo** (decisões) e o texto livre do que foi discutido;
  - todo usuário ativo **lê**; só Admin cria, edita, **fixa no topo** e exclui (garantido pelo RLS da tabela `atas`);
  - busca por título, participante ou assunto (sem diferenciar acento);
  - a ata pode ser ligada a um evento do calendário: no dia, o evento ganha o botão 📝 (ver ou escrever a ata);
  - autor e último editor são gravados pelo próprio banco; fechar o formulário com texto não salvo pede confirmação.
- **Primeiro acesso**: quem entra com senha provisória vê a tela *Crie sua senha* (nova senha + confirmação)
  antes de liberar o calendário.

## Estrutura

```
index.html              telas e diálogos (+ script que aplica o tema antes de desenhar)
public/logo-mahanaim.jpg  logo da igreja (menu, login, favicon)
docs/redesign/          proposta da nova interface e protótipo navegável
src/main.ts             lógica da tela (só fala com `api`)
src/styles.css          visual: cores da igreja, temas claro/escuro, menu lateral, responsivo
src/domain/types.ts     tipos do domínio (Evento, Usuario, Solicitacao...)
src/domain/schemas.ts   validações com Zod (reaproveitáveis no servidor)
src/api/contract.ts     interface CalendarApi = contrato do backend
src/api/mock.ts         implementação simulada (localStorage)
src/api/supabase.ts     implementação real (Supabase) + conversões app ↔ banco
src/api/database.types.ts  tipos gerados a partir do banco
src/api/index.ts        escolhe a implementação (Supabase se houver .env.local)
supabase/migrations/    estrutura, carga inicial, ajustes e permissões do banco
supabase/functions/     Edge Functions criar-usuario e excluir-usuario (usam a chave de serviço no servidor)
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
- **Permissões**: GRANT só para usuários logados + RLS (quem tem perfil **ativo** lê; só admin ativo grava).
  Usuário desativado não lê nem grava nada, mesmo chamando a API direto com um token ainda válido
  (helper `is_ativo()`); ele só enxerga o próprio perfil, para o app mostrar o aviso de acesso desativado.
  Usuário comum cria/cancela pedidos pelas funções `solicitar_evento` e `cancelar_solicitacao`.
- Categorias da tela ↔ tipos do banco: `evento` = `especial`/`conferencia`/`reuniao`,
  `aniv` = `aniversario`, `data` = `data_comemorativa`.
- **Senha provisória**: `perfis.senha_provisoria` nasce `true` em todo acesso novo; só a própria pessoa
  a desmarca, pela função `concluir_troca_senha` (um gatilho impede o admin de mudar isso pela API).
- **Exclusão de usuário**: apagar do Auth apaga o perfil (`on delete cascade`) e as solicitações da pessoa;
  eventos criados por ela continuam no calendário, sem autor.
- Pendências: "Esqueci a senha" por e-mail; sessão de 30 dias configurada no painel do Auth.
