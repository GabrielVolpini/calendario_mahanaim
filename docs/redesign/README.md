# Nova interface do Calendário Mahanaim — proposta

> **Status:** aprovada e implementada no app (branch `nova-interface`).
> **Protótipo navegável:** [`prototipo.html`](prototipo.html) (abra no navegador; funciona sozinho, sem servidor e sem banco).
> **Data:** 27/11/2026 (revisão 2: barra de período, botão Calendário/Lista e calendário no celular)

## 1. O que foi pedido

| # | Pedido | Como a proposta atende |
|---|---|---|
| 1 | Usar as **cores da igreja** (Instagram @igrejamahanaim) | Paleta tirada do próprio logo: azul-marinho profundo, rosa-claro e o anel em degradê coral → rosa → violeta (seção 3). |
| 2 | Usar o **mesmo logo** da foto de perfil do Instagram | Logo capturado em 720×720 px e salvo em [`logo-mahanaim.jpg`](logo-mahanaim.jpg). Entra no menu lateral, na tela de login e como ícone da aba do navegador (favicon). |
| 3 | Identidade visual inspirada no **Dribbble** ([Calendar – Dashboard Design](https://dribbble.com/shots/20596928-Calendar-Dashboard-Design)) | Mesma estrutura: menu lateral, painel com minicalendário e filtros, barra superior com busca e usuário, grade grande do mês com eventos em “etiquetas” (barra colorida + horário + título). |
| 4 | **Todas as abas no menu lateral**, que abre e fecha | Calendário, Solicitações, Atas de reunião e Usuários saem dos botões do topo e vão para o menu. O menu recolhe para só ícones (e no celular vira gaveta). |
| 5 | **Modo claro e modo escuro** com botão para trocar | Seletor **Claro / Escuro / Sistema** no rodapé do menu. A escolha fica salva no navegador. |

## 2. Como fica a tela

```
┌──────────┬──────────────────┬──────────────────────────────────────────────────────┐
│  (logo)  │ Novembro 2026 ‹ ›│ 🔍 Buscar evento…        [+ Novo evento]  🔔  (avatar) │
│ Mahanaim │  D S T Q Q S S   ├──────────────────────────────────────────────────────┤
│          │  1 2 3 4 5 6 7   │ [Mês|Semana|Dia|Ano]  ‹ novembro de 2026 ›  Hoje [📅|☰]│
│ ▣ Calend.│  …               │ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐          │
│ ✉ Solic.2│ ──────────────   │ │ DOM │ SEG │ TER │ QUA │ QUI │ SEX │ SÁB │          │
│ 📝 Atas  │ Tipos de evento  │ ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤          │
│ 👥 Usuár.│ ☑ Cultos         │ │  1  │  2  │  3  │ …   │     │     │     │          │
│          │ ☑ Eventos        │ │▌10h │▌Fin.│▌20h │     │     │     │     │          │
│          │ ☑ Reuniões …     │ │ Cul…│     │ Cul…│     │     │     │     │          │
│ ☀ ◐ 🖥   │ Campanha do mês  │ └─────┴─────┴─────┴─────┴─────┴─────┴─────┘          │
│ « Recolher│                 │                                                      │
└──────────┴──────────────────┴──────────────────────────────────────────────────────┘
  menu lateral   painel             área principal        [📅|☰] = Calendário / Lista
```

### 2.1 Menu lateral (novo)

- **Topo:** logo redondo da igreja + “Mahanaim / Gestão da liderança”.
- **Itens:**
  | Item | Quem vê | Rota |
  |---|---|---|
  | Calendário | todos | `/` |
  | Solicitações (com contador de pendentes) | todos (Admin: aprovar; User: *Minhas solicitações*) | `/solicitacoes` *(nova rota; hoje é um diálogo)* |
  | Atas de reunião | todos | `/atas` |
  | Usuários | só Admin (o item nem aparece para User) | `/users` |
- **Rodapé:** seletor de tema (Claro / Escuro / Sistema), cartão do usuário logado (nome, e-mail, perfil) com **Sair**, e no Admin o **Restaurar dados de exemplo** (só no modo protótipo).
- **Abrir/fechar:**
  - Computador: botão **«** recolhe para uma faixa de 72 px só com ícones (o nome aparece ao passar o mouse). A escolha fica salva.
  - Tablet (até 1100 px): começa recolhido.
  - Celular (até 760 px): menu vira **gaveta** aberta pelo botão ☰ no topo; fecha ao tocar fora ou escolher um item.
- O item ativo ganha uma barrinha com o degradê do logo.

### 2.2 Painel do calendário (novo, só na tela Calendário)

- **Minicalendário** do mês com pontinhos nos dias que têm eventos. Clicar num dia abre aquele dia na visão Dia.
- **Tipos de evento** com caixinhas (Cultos, Eventos, Reuniões, Ensaios, Aniversários, Feriados, Datas comemorativas). É a legenda que hoje fica embaixo da grade, só que no lugar do Dribbble. Funciona igual: desmarcar esconde aquele tipo.
- **Campanha do mês** (ex.: *Novembro Azul*) como um cartão colorido. Admin edita por ali.
- No tablet e no celular o painel vira um botão **Filtros** (ícone de funil) que abre por cima.

### 2.3 Área principal

- **Barra superior:** busca de eventos, botão principal (**+ Novo evento** para Admin, **Solicitar evento** para User), sino de notificações e avatar.
- **Barra de período (igual à de hoje):** abas **Mês · Semana · Dia · Ano** à esquerda, **‹ novembro de 2026 ›** no centro e, à direita, **Hoje** e o novo botão **Calendário / Lista**.
- **Calendário / Lista:** a Lista deixa de ser uma aba e vira um modo que vale para qualquer período. Ex.: *Semana + Lista* mostra só os eventos da semana em lista; *Mês + Lista* mostra o mês inteiro em lista. A escolha fica salva.
- **Grade do mês:** células altas e arejadas. Cada evento é uma etiqueta com barra na cor do tipo, horário em cinza e título (`18h30 · Culto da Família`). O dia de hoje tem círculo no degradê da igreja e feriado pinta o número de vermelho. Pedido pendente continua **tracejado**.
- Mais de 3 itens no dia: “+2”. No computador, clicar no dia abre o diálogo do dia (ver, editar, adicionar), como antes.

### 2.3.1 Calendário no celular

- As etiquetas continuam na grade do mês, **com o nome escrito em letra bem pequena** (sem o horário), na cor do tipo. Para caber, o nome é encurtado: *Culto de Celebração* → **Celebração**, *Culto da Família* → **Família**, *Confraternização* → **Confrat.**, *Reunião de liderança* → **Reun. liderança**.
- **Tocar num dia seleciona o dia** (contorno rosa) e mostra logo **abaixo da grade** a agenda do dia: horário, título e local de cada evento, mais o botão *Adicionar neste dia* (Admin) ou *Solicitar evento neste dia* (User). O usuário não sai do mês.
- Ao abrir, o dia selecionado é hoje.
- A barra de período quebra em duas linhas: abas em cima, depois **‹ mês ›** e o botão Calendário/Lista só com ícones. O **Hoje** sai no celular (o mês abre em hoje e o dia de hoje já fica destacado).

### 2.4 Outras telas

| Tela | O que muda |
|---|---|
| **Atas de reunião** | Mesmo conteúdo e regras; cartões novos, ata fixada com selo, busca no topo. Sai o botão “‹ Voltar ao calendário” (o menu já faz isso). |
| **Usuários** | Mesma tabela e regras; avatar com iniciais, perfil em selo, **+ Novo usuário** no cabeçalho. |
| **Solicitações** | Vira página própria em vez de diálogo, com abas Pendentes / Aprovadas / Recusadas. |
| **Login e “Crie sua senha”** | Fundo azul-marinho com o degradê do logo, logo real no lugar do “M” e subtítulo **Gestão da liderança**. |
| **Diálogos** (evento, dia, ata, novo usuário, confirmação) | Só o visual: cantos, cores e botões novos. Campos e validações iguais. |

## 3. Identidade visual

### 3.1 Cores da marca (tiradas do logo)

| Nome | Cor | Onde aparece no logo | Uso no app |
|---|---|---|---|
| Marinho 900 | `#070C2A` | fundo do círculo (parte de cima) | fundo do modo escuro |
| Marinho 700 | `#0B1650` | fundo do círculo | menu lateral; botão principal no modo claro |
| Marinho 500 | `#1B2566` | parte de baixo do círculo | estados de foco/hover |
| Rosa-claro | `#FDE6EE` | a casa/chama do símbolo | texto do menu; botão principal no modo escuro; destaques suaves |
| Lavanda | `#A38AA7` | brilho na base do círculo | textos secundários sobre marinho |
| Degradê do anel | `#F2876B → #E05A9A → #A64BD6` | anel fino em volta do logo | dia de hoje, item ativo do menu, foco, detalhes |

### 3.2 Modo claro × modo escuro

| Token | Claro | Escuro |
|---|---|---|
| Fundo | `#F5F3F8` | `#070C2A` |
| Superfície (cartões, grade) | `#FFFFFF` | `#0F1640` |
| Linhas | `#E8E3EF` | `#1F2858` |
| Texto | `#0B1442` | `#F4EEF6` |
| Texto secundário | `#5E6485` | `#A8ABCB` |
| Botão principal | marinho `#0B1650` + texto branco | rosa-claro `#FDE6EE` + texto marinho |
| Menu lateral | marinho `#0B1650` | marinho `#050920` |

- **Sistema** (padrão) segue o celular/computador. **Claro** e **Escuro** forçam. Salvo em `localStorage` (`mahanaim-tema`) e aplicado antes da página aparecer, para não piscar.
- O CSS atual já tem a base (`:root[data-theme="dark"]`); falta o botão e a troca das cores.

### 3.3 Cores dos tipos de evento

Ajustadas para combinar com o marinho, mas cada tipo continua com a cor de sempre:

| Tipo | Claro | Escuro |
|---|---|---|
| Culto | `#3B6FE0` | `#7A9BFF` |
| Evento | `#D9960F` | `#F5C451` |
| Reunião | `#7A55D9` | `#A98BFF` |
| Ensaio | `#0F8FA0` | `#46CDE0` |
| Aniversário | `#D9508F` | `#F58BBE` |
| Feriado | `#E04848` | `#FF7A7A` |
| Data comemorativa | `#2E9466` | `#5BCF98` |

### 3.4 Tipografia, formas e ícones

- **Fonte:** Figtree (já usada hoje). Títulos 700, textos 400/500.
- **Cantos:** 12 px em cartões e botões, 8 px em etiquetas, círculo no logo/avatar/hoje.
- **Ícones:** traço fino (estilo Lucide), desenhados em SVG dentro do app, sem biblioteca nova.
- **Acessibilidade:** contraste AA em textos nos dois temas; foco visível com contorno do degradê; menu e painel navegáveis por teclado; `aria-expanded` no botão de recolher.

## 4. Funcionalidades novas (resumo)

1. **Menu lateral recolhível** com Calendário, Solicitações, Atas e Usuários (respeitando o perfil).
2. **Seletor de tema** Claro / Escuro / Sistema, salvo no navegador.
3. **Logo oficial** no menu, login e favicon.
4. **Painel do calendário** com minicalendário e filtros por tipo.
5. **Botão Calendário / Lista** no canto direito da barra de período, junto do *Hoje*: a lista passa a valer para dia, semana, mês ou ano.
6. **Celular:** nomes dos eventos visíveis na grade e agenda do dia tocado logo abaixo.
7. **Solicitações como página** (`/solicitacoes`) em vez de diálogo.
8. **Layout responsivo novo:** gaveta no celular, painel “Filtros” sobreposto no tablet.

### Sugestões extras (só se você aprovar)

Aparecem no protótipo porque estão no modelo do Dribbble, mas **não** foram pedidas:

- **Busca de eventos** na barra superior (por título e local).
- **Sino de notificações** com as solicitações pendentes (Admin) ou respondidas (User).

Se preferir, saem do escopo e a barra superior fica só com o usuário.

## 5. O que NÃO muda

- Banco, Supabase, permissões (RLS), Edge Functions e validações Zod.
- Regras de quem pode o quê (Admin × User).
- Campos dos formulários, séries de cultos, campanha do mês, atas ligadas a eventos.
- Rotas atuais (`/`, `/users`, `/atas`) continuam funcionando.

## 6. Plano de desenvolvimento (depois da aprovação)

| Etapa | Arquivos | Entrega |
|---|---|---|
| 1. Tokens de cor e tema | `src/styles.css`, `index.html` (script de tema no `<head>`) | Paleta nova + seletor Claro/Escuro/Sistema |
| 2. Logo | `public/logo-mahanaim.jpg`, `index.html` | Logo no menu, login e favicon |
| 3. Estrutura com menu lateral | `index.html`, `src/main.ts` (roteamento), `src/styles.css` | Menu recolhível + gaveta no celular |
| 4. Painel e barra de período | `index.html`, `src/main.ts` (`buildLegend` → filtros do painel, minicalendário, modo Calendário/Lista) | Painel, filtros e botão Calendário/Lista |
| 5. Grade e etiquetas novas | `src/main.ts` (`renderGrid`, `renderWeek`…), `src/styles.css` | Visual do Dribbble nas 4 visões + lista; no celular, nomes pequenos e agenda do dia selecionado |
| 6. Telas Atas, Usuários, Solicitações | `index.html`, `src/main.ts` | Páginas no novo layout; `/solicitacoes` |
| 7. Login e diálogos | `index.html`, `src/styles.css` | Visual novo |
| 8. Conferência | — | `npm run build`, teste no navegador (Admin e User, claro e escuro, celular e computador) |

Tudo em um branch e um PR, como nos anteriores.

## 7. Decisões para você

1. **Busca e notificações** entram agora ou ficam para depois?
2. **Menu lateral marinho nos dois temas** (como no protótipo, reforça a marca) ou **branco no modo claro** (mais parecido com o Dribbble)?
3. **Solicitações** viram página própria ou continuam como diálogo, só abertas pelo menu?

---

*Logo: foto de perfil do Instagram @igrejamahanaim. Referência de layout: shot “Calendar – Dashboard Design” no Dribbble (apenas inspiração de estrutura; nenhuma imagem dele é usada no app).*
