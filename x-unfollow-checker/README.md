# Quem não me segue de volta (X/Twitter)

Extensão de navegador (Chrome/Edge/Brave, Manifest V3) que mostra, na sua
própria conta, quem você segue no X que não te segue de volta — e permite
deixar de seguir manualmente, um perfil por vez. Mesma arquitetura da versão
para Instagram: um painel injetado dentro da própria página do x.com (não um
popup separado), com limites de segurança embutidos desde o início.

## O que ela faz e o que ela **não** faz

- **Leitura**: busca suas listas de seguidores e "seguindo" usando a mesma
  sessão que você já tem aberta em x.com.
- **Unfollow manual**: cada "Deixar de seguir" é uma ação isolada, disparada
  por dois cliques seus (o segundo confirma). Não há laço automático nem
  fila em massa.
- **Limites de segurança** (no background, valem mesmo fechando o painel):
  intervalo mínimo de ~20 min entre sincronizações completas; ~20-35s entre
  unfollows; pausa automática de 30 min após um erro 429, ou 24h ao detectar
  qualquer sinal de limitação/bloqueio na resposta do X. Nenhum desses
  tenta de novo sozinho.

## ⚠️ Risco técnico maior que a versão do Instagram

A listagem de seguidores/seguindo no site atual do X é feita via GraphQL
com um `queryId` que muda a cada atualização do front-end — evitei depender
disso usando os endpoints REST v1.1 mais antigos (`friends/list.json`,
`followers/list.json`, `friendships/destroy.json`), que costumam continuar
funcionando com a sessão do navegador, mas são mais propensos a mudar ou
serem descontinuados sem aviso do que os do Instagram.

Se a sincronização falhar (erro `HTTP_401`, `HTTP_403` ou `HTTP_404` logo de
cara), o mais provável é que algum desses três valores precise ser
atualizado em `background.js`:

1. **`BEARER_TOKEN`** (linha perto do topo do arquivo) — token público do
   cliente web do X. Para pegar o valor atual: abra o X normalmente no
   navegador, DevTools → aba Network, clique em qualquer coisa que carregue
   dados (rolar o feed, por exemplo), ache uma requisição para
   `x.com/i/api/...` e copie o header `authorization` (formato
   `Bearer AAAA...`).
2. Os **endpoints** `friends/list.json` / `followers/list.json` — se
   estiverem retornando 404, o X pode ter desativado essas rotas legadas;
   nesse caso, no mesmo Network tab, ache a requisição feita quando você
   abre a lista de seguidores pelo próprio site (será algo como
   `x.com/i/api/graphql/<queryId>/Followers`), e me mande a URL completa e
   os parâmetros — eu adapto o código pra usar o endpoint GraphQL real.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` (ou equivalente no Edge/Brave).
2. Ative o "Modo do desenvolvedor" no canto superior direito.
3. Clique em "Carregar sem compactação" e selecione a pasta
   `x-unfollow-checker/`.
4. Faça login normalmente em [x.com](https://x.com) em alguma aba do
   navegador.
5. Nessa mesma aba, clique no ícone da extensão para abrir o painel (canto
   superior direito da página) e depois em "Sincronizar dados".

## Limitações conhecidas

- Depende de endpoints internos (não documentados publicamente) que o
  próprio X usa — veja a seção de risco técnico acima.
- Contas com muitos seguidores levam mais tempo para sincronizar.
- Use apenas na sua própria conta, e não em paralelo com nenhuma outra
  ferramenta de automação de follow/unfollow.
