# Quem não me segue de volta (Instagram) — versão com limite de uso

by [@lace.eli](https://www.instagram.com/lace.eli/)

Extensão de navegador (Chrome/Edge/Brave, Manifest V3) que mostra, na sua
própria conta, quem você segue e não te segue de volta — e permite deixar
de seguir manualmente, um perfil por vez.

## Limite de uso e senha de desbloqueio

- Vem com **5 sincronizações** liberadas. Só conta uma sincronização que
  termina de verdade — uma que for interrompida (limite do Instagram, erro
  de rede) não gasta uso. Unfollows não contam.
- Quando os usos acabam, o painel troca o botão "Sincronizar dados" por um
  campo de senha. A senha certa libera **mais 5 sincronizações**; ela só é
  aceita quando os usos já acabaram (não dá pra acumular).
- A senha não aparece em nenhum arquivo da extensão — só o hash dela, em
  `UNLOCK_PASSWORD_SHA256`. Guarde a senha em outro lugar. Para trocar:
  1. Abra o DevTools de qualquer página (F12 → Console) e rode, trocando
     `SUA_SENHA_NOVA`:
     ```js
     crypto.subtle.digest("SHA-256", new TextEncoder().encode("SUA_SENHA_NOVA")).then(d => console.log([...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("")))
     ```
  2. Copie o texto que aparecer e cole no lugar do valor de
     `UNLOCK_PASSWORD_SHA256`, perto do topo de `background.js`.
  3. Recarregue a extensão em `chrome://extensions`.
- Os números ficam em `FREE_USES` e `UNLOCK_USES` no mesmo arquivo.

**Limitações do bloqueio** (vale saber antes de vender): tudo roda no
navegador de quem usa, sem servidor. Então a mesma senha serve pra sempre
para quem já a conhece (cada vez que os usos acabam, ela libera mais 5);
desinstalar e reinstalar a extensão zera o contador de volta para 5; e
quem souber editar os arquivos da extensão consegue remover o limite. É um
bloqueio de conveniência, não uma proteção forte — para senhas de uso único
ou por cliente, seria preciso um servidor que valide as chaves.

## O que ela faz e o que ela **não** faz

- **Leitura**: busca suas listas de seguidores e "seguindo" usando a mesma
  sessão que você já tem aberta em instagram.com (nenhuma senha é
  solicitada ou armazenada pela extensão).
- **Unfollow manual**: cada "Deixar de seguir" é uma ação isolada, disparada
  por dois cliques seus (o segundo confirma). Não há laço automático nem
  fila em massa.
- **Sem automação de escrita**: a extensão nunca dispara unfollow sozinha.
- **Limites de segurança**: sincronizações completas exigem um intervalo
  mínimo de ~20 min entre si, unfollows exigem ~20-35s de intervalo entre um
  e outro, e a extensão trava sozinha por 30 min (após um erro 429) ou 24h
  (ao detectar qualquer sinal de limitação de ação vindo do Instagram na
  resposta) sem tentar de novo. Esses limites vivem no background da
  extensão, não na tela, então valem mesmo fechando e reabrindo o painel.
- **Painel injetado na própria página**: ao clicar no ícone da extensão
  enquanto estiver em instagram.com, um painel aparece sobre a página (não é
  um popup separado). É isso que permite carregar as fotos de perfil de
  verdade — o CDN do Instagram bloqueia esse tipo de imagem quando o pedido
  vem de fora do próprio site (ex.: de um popup de extensão), mas aceita
  quando a imagem é carregada a partir do documento real do instagram.com.

Isso existe porque o Instagram proíbe em seus Termos de Uso qualquer
automação de ações (seguir/deixar de seguir) via bots, scripts ou extensões
de terceiros — inclusive versões "temporizadas" feitas para simular um
humano. Contas que usam esse tipo de automação podem ser bloqueadas
temporária ou permanentemente. Por isso esta extensão só automatiza a
**leitura** dos seus próprios dados; toda ação de escrita depende de um
clique explícito seu.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` (ou equivalente no Edge/Brave).
2. Ative o "Modo do desenvolvedor" no canto superior direito.
3. Clique em "Carregar sem compactação" e selecione a pasta
   `instagram-unfollow-checker-trial/`.
4. Faça login normalmente em [instagram.com](https://www.instagram.com) em
   alguma aba do navegador.
5. Nessa mesma aba, clique no ícone da extensão para abrir o painel (ele
   aparece no canto superior direito da página) e depois em "Sincronizar
   dados". Clicar no ícone de novo, ou no "×" do painel, fecha o painel.

## Limitações conhecidas

- Depende de endpoints internos (não documentados publicamente) que o
  próprio site do Instagram usa. O Instagram pode alterá-los a qualquer
  momento, o que pode quebrar a sincronização — não há garantia de
  funcionamento contínuo.
- Contas com muitos milhares de seguidores levam mais tempo para
  sincronizar, pois os dados são paginados como no próprio site.
- Se o Instagram responder com limite de requisições (erro 429), a
  extensão avisa na tela — aguarde alguns minutos antes de tentar de novo.
- Use apenas na sua própria conta. Clicar em "Deixar de seguir" em muitos
  perfis em sequência rápida, mesmo manualmente, pode acionar os limites
  de segurança do Instagram.
