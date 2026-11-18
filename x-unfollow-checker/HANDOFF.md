# Handoff — X Unfollow Checker

Contexto para continuar o trabalho desta extensão em uma nova sessão.
Leia este arquivo inteiro antes de mexer no código.

## O que é

Extensão Chrome (Manifest V3) que mostra quem o usuário segue no X
(x.com / twitter.com) e não o segue de volta, com unfollow **manual**, um
perfil por vez. Mesma arquitetura da versão do Instagram que está em
`../instagram-unfollow-checker/` (essa funciona e serve de referência).

Repositório: `eliabel-acerda/approtina`, branch
`claude/instagram-bulk-unfollow-extension-x8k343` (PR #1, ainda não
mergeado em `main` no momento deste handoff).

## Decisões já tomadas (não reabrir sem o usuário pedir)

- **Nada de unfollow automático, em massa ou temporizado** (ex.: "5
  unfollows a cada 10 minutos"). Isso foi pedido e recusado de propósito:
  automatizar ações de escrita em sequência é o padrão que sistemas
  antiabuso procuram, e a conta do usuário no Instagram já recebeu uma
  limitação. A extensão só automatiza **leitura**; cada unfollow é um
  clique do usuário com confirmação em dois cliques.
- Os limites de segurança ficam no **background** (service worker), não
  na UI, pra valerem mesmo fechando o painel.
- O painel é injetado **dentro da página** do x.com (content script +
  Shadow DOM), não um popup — mesmo motivo da versão do Instagram (fotos de
  perfil e contexto real da página).

## Arquivos

| Arquivo | Papel |
|---|---|
| `manifest.json` | MV3. Permissões `storage`, `cookies`; hosts `x.com/*` e `twitter.com/*`. Sem popup: o clique no ícone liga/desliga o painel. |
| `background.js` | Service worker: lê cookies, chama a API, pagina listas, aplica limites de segurança, faz o unfollow. |
| `content.js` | Painel em Shadow DOM: botão sincronizar, lista com avatar/@/nome/link, busca, unfollow em dois cliques, mensagens de erro amigáveis. |
| `README.md` | Instruções de instalação e de troca do bearer token. |
| `icons/` | Ícones 16/32/48/128 (gerados por script, tema escuro). |

## Como funciona hoje (`background.js`)

- **Usuário logado:** cookie `twid` (formato `u%3D<id>` → decodifica pra
  `u=<id>`). Confirmado que funciona.
- **Autenticação das chamadas:** header `Authorization: Bearer <token
  público do cliente web>` + `x-csrf-token` (cookie `ct0`) +
  `x-twitter-active-user: yes` + `x-twitter-auth-type: OAuth2Session`.
  `BEARER_TOKEN` = o mesmo usado pelo twscrape e pelo yt-dlp
  (`AAAA…NRILg…%3D1Zv7…` — o `%3D` literal faz parte do valor, não decodificar).
- **Listas:** endpoints REST v1.1 legados
  `GET /i/api/1.1/friends/list.json` e `/followers/list.json`
  (`count=20`, paginação por `cursor` / `next_cursor_str`), com pausa de
  4–7 s entre páginas e entre as duas listas.
- **Sincronização retomável:** depois de cada página bem-sucedida, salva
  `{cursor, list}` em `chrome.storage.local` na chave `xSyncPartial`; a
  próxima sincronização continua de onde parou.
- **Unfollow:** `POST /i/api/1.1/friendships/destroy.json` com
  `user_id=<id>`.
- **Limites (chave `xSafetyState`):** 20 min entre sincronizações;
  20–35 s entre unfollows; 429 → trava 30 min; corpo com sinal de
  bloqueio de conta (`326`, `64`, "temporarily locked"…) → trava 24 h.
- **Resultado:** chave `xUnfollowCheckerResult`.

## Histórico de problemas e correções

1. **Painel transparente** — `:root` dentro do `<style>` da Shadow DOM não
   casa com nada; variáveis CSS foram movidas pra `:host`. Resolvido.
2. **"Você precisa estar logado" com cookies válidos** — o `BEARER_TOKEN`
   estava errado e todo pedido voltava 401, mapeado como `NOT_LOGGED_IN`.
   Trocado pelo token correto. Resolvido. Um 401 agora loga o corpo da
   resposta no console do service worker.
3. **"Extension context invalidated"** — aparece ao recarregar a extensão
   com a aba aberta; o painel agora pede F5. Não é bug.
4. **HTTP 429 em toda sincronização — NÃO RESOLVIDO.** Carrega algumas
   páginas e então o X responde 429; a extensão pausa 30 min. Depois de
   esperar, acontece de novo. **O usuário nunca conseguiu completar uma
   sincronização.** Hipótese: os endpoints v1.1 legados têm cota por
   número de requisições numa janela de tempo (não por velocidade), e uma
   conta com centenas de seguidores/seguindo não cabe numa janela. A
   retomada (`xSyncPartial`) foi adicionada pra avançar a cada ciclo, mas
   **ainda não foi confirmada pelo usuário** em uma conta real.

## Próximos passos sugeridos

1. Pedir ao usuário pra testar a versão atual (com retomada) e reportar:
   quantas contas carregam por ciclo antes do 429, e se a contagem avança
   entre ciclos. Se avançar, talvez baste ajustar o texto da UI pra deixar
   claro que leva vários ciclos.
2. Se não avançar ou for lento demais, **migrar a leitura para GraphQL**,
   que é o que o próprio site do X usa e tem cotas mais generosas:
   - `GET https://x.com/i/api/graphql/<queryId>/Following` e `/Followers`,
     com query params `variables` (JSON: `userId`, `count: 20`,
     `includePromotedContent: false`, `cursor`) e `features` (JSON).
   - Referência mantida e atualizada: o projeto **twscrape**
     (`vladkens/twscrape`, arquivo `twscrape/api.py`), que tem os
     `queryId` atuais (gerados automaticamente), o dicionário
     `GQL_FEATURES`, e o parse das respostas (`entries` / cursor
     `cursorType == "Bottom"`). Baixe o arquivo **cru**
     (raw.githubusercontent.com) — resumos de IA já trocaram um caractere
     de `queryId` nesta sessão.
   - Atenção: o twscrape também gera um header
     `x-client-transaction-id`; sem ele algumas chamadas GraphQL voltam
     404. Verificar se é necessário antes de implementar (é complexo).
   - Os `queryId` mudam quando o X atualiza o front-end; documentar no
     README como recapturar pelo Network tab.
3. Manter tudo o que está em "Decisões já tomadas".

## Como testar

- Instalação: `chrome://extensions` → Modo do desenvolvedor → Carregar sem
  compactação → pasta `x-unfollow-checker/` → abrir x.com logado → F5 →
  clicar no ícone.
- Logs: `chrome://extensions` → "Inspecionar visualizações: service worker".
- Resetar estado (console do service worker):
  `chrome.storage.local.remove(["xSafetyState","xSyncPartial","xUnfollowCheckerResult"])`
- Sem conta real no ambiente de desenvolvimento: dá pra validar sintaxe com
  `node --check` e simular `chrome.*` com um mock em Node (foi feito assim
  pra versão do Instagram), mas o comportamento da API do X só se confirma
  com o usuário testando.

## Observações

- Não peça nem guarde cookies/tokens do usuário (`auth_token`, `ct0`) em
  arquivos ou commits.
- Interface e mensagens em português (pt-BR).
