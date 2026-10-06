# Peneira — quem não te segue (Instagram)

Extensão de navegador (Chrome/Edge/Brave, Manifest V3), **para uso
pessoal**. Mostra quem você segue no Instagram e não te segue de volta, e
ajuda a deixar de seguir essas contas em uma **fila assistida**: você
escolhe todo mundo de uma vez, e a fila te mostra um perfil por vez. Cada
unfollow continua sendo um clique seu.

É um produto separado das outras extensões deste repositório (pasta,
nome, ícone e dados próprios). Pode ficar instalada junto com elas.

## Como usar

1. Entre no instagram.com já logado e clique no ícone da Peneira.
2. **Sincronizar dados** carrega quem não te segue de volta.
3. Marque os perfis (ou **Selecionar todos**, que respeita o filtro de
   busca) e clique em **Montar fila**.
4. A fila mostra um perfil por vez, com foto, @ e link:
   - **Deixar de seguir**: um clique, sem confirmação extra (a seleção já foi
     a confirmação).
   - **Pular**: passa pro próximo sem deixar de seguir.
5. Depois de cada unfollow, o botão espera a pausa de segurança (~20–35 s)
   e volta a ficar disponível sozinho. Com **Avisar quando liberar** marcado,
   toca um bipe curto; se a aba estiver em segundo plano, aparece também uma
   notificação (clicar nela volta pra aba) e o título da aba ganha
   "(Liberado)".
6. A fila fica salva: dá pra fechar a aba ou o navegador e continuar outro
   dia de onde parou. **Sair da fila** (dois cliques) descarta o que falta.

Na lista normal continua dando pra deixar de seguir um perfil avulso, com o
clique duplo de confirmação.

## Limites de segurança

- Pausa mínima de ~20–35 s entre unfollows (aplicada no background, vale
  também pra fila).
- Intervalo mínimo de ~20 min entre sincronizações completas.
- Se o Instagram responder com limite (429), tudo trava por 30 min; se
  sinalizar limitação de ação na conta, trava por 24 h. A fila mostra o
  aviso e não tenta de novo sozinha.
- Contador de unfollows do dia. A partir de 50 no mesmo dia, a fila mostra
  um aviso sugerindo continuar amanhã (é só um aviso — você decide).

Nada disso garante que o Instagram não limite a conta: clicar em muitos
unfollows no mesmo dia, mesmo manualmente, pode acionar os limites dele.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` e ative o "Modo do desenvolvedor".
2. "Carregar sem compactação" → selecione a pasta `peneira-instagram/`.
3. Abra o instagram.com logado, aperte F5 e clique no ícone da Peneira.

## Permissões

- `storage`: guarda a lista, a fila, o contador do dia e as preferências,
  só no seu navegador.
- `cookies`: lê `ds_user_id` e `csrftoken` do instagram.com para as
  requisições.
- `notifications`: aviso de "próximo liberado" quando a aba está em
  segundo plano.
- `https://www.instagram.com/*`: painel na página, leitura das listas e o
  unfollow que você clicar.
