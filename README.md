# Calendário Mahanaim — protótipo navegável

Protótipo funcional (estilo "Figma clicável") do calendário da liderança.
Ainda **sem banco de dados**: tudo é salvo no `localStorage` do navegador,
através de uma API simulada que já define o contrato do futuro backend.

## Como abrir

```bash
cd ~/Desktop/calendario_mahanaim && python3 -m http.server 8765
```

Depois acesse http://127.0.0.1:8765. Na tela de login há dois atalhos de demonstração:

| Perfil | E-mail | Senha |
|---|---|---|
| Admin | admin@mahanaim.demo | admin123 |
| User | membro@mahanaim.demo | membro123 |
| User | louvor@mahanaim.demo | louvor123 |

No menu do Admin, **Restaurar dados de exemplo** volta tudo ao estado inicial.

## O que o protótipo cobre

- **Login com e-mail e senha** e opção **Lembrar de mim por 30 dias**
  (marcado: sessão de 30 dias; desmarcado: sessão até fechar o navegador).
- **Perfil User (visualização)**: vê o calendário, envia **solicitações de evento**
  e acompanha em *Minhas solicitações* (pode cancelar enquanto pendente).
  O pedido aparece tracejado no calendário só para o autor e para os admins.
- **Perfil Admin**:
  - cria, edita e exclui eventos (inclusive de vários dias);
  - eventos recorrentes (cultos) podem ser alterados em **somente este dia**
    ou **este e os próximos da série**;
  - fila de **Solicitações**: aprovar, ajustar e aprovar, ou recusar com motivo;
  - **Usuários**: criar acesso, trocar perfil, desativar/reativar;
  - **Campanha do mês** (Novembro Azul etc.): adicionar, editar, remover.

## Estrutura

```
index.html        telas e diálogos
css/styles.css    visual (claro/escuro, responsivo)
js/seed.js        dados iniciais (vira o script de carga do banco)
js/api.js         API simulada = contrato do backend
js/app.js         lógica da tela; só fala com window.API
```

## Próxima fase: banco de dados

Trocar o corpo das funções de `js/api.js` por chamadas `fetch()` ao servidor,
mantendo nomes e retornos. Modelo de dados sugerido:

- **usuarios**: id, nome, email (único), senha_hash, perfil (`admin` | `user`), ativo, criado_em
- **sessoes**: id, usuario_id, token_hash, expira_em (30 dias se "lembrar de mim"), criado_em
- **eventos**: id, data, fim (opcional), categoria (`feriado` | `evento` | `aniv` | `data` | `culto`),
  titulo, horario, local_obs, serie (opcional), criado_por, atualizado_em
- **solicitacoes**: id, status (`pendente` | `aprovada` | `recusada`), autor_id, evento (dados pedidos),
  mensagem, motivo, revisado_por, revisado_em, evento_id (quando aprovada), criado_em
- **campanhas**: ano_mes (PK, ex.: `2026-11`), nome, descricao, cor

Pontos de atenção para o backend:

- As regras de permissão em `api.js` (só admin grava eventos, aprova pedidos e gerencia usuários)
  precisam ser aplicadas **no servidor**. A tela só esconde botões.
- Senhas: guardar apenas hash (bcrypt/argon2). No protótipo elas estão em texto puro de propósito.
- "Lembrar de mim": cookie `HttpOnly` + `Secure` com token de sessão de 30 dias, em vez de `localStorage`.
- "Esqueci a senha" ainda não tem fluxo (precisa de envio de e-mail).
