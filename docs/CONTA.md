# Conta com Google, progresso salvo e placar do dia

Entrar é **opcional**. Sem conta, o jogo é exatamente o mesmo de antes (progresso no navegador, curva anônima).

## O que o jogador vê

- Botão **Conta** (bonequinho) na lateral, embaixo do som. Só aparece no site, com o login ligado
  (variável `GOOGLE_CLIENT_ID`). Abre a janela com o botão **Fazer login com o Google**.
- Logado: o apelido do placar (dá para trocar), **SAIR** e **EXCLUIR CONTA** (apaga tudo na hora).
- No fim da viagem, a seção **PLACAR DO DIA**: top 10 (ou 50), a sua posição e, para quem não entrou,
  o botão **ENTRAR COM GOOGLE** (a viagem de hoje ainda entra se ele entrar antes da meia-noite).
- Nos **ARQUIVOS**, o fim de cada dia mostra o placar daquele dia, já fechado.

## As regras do placar

1. **Só quem está logado.** A viagem vai para o placar quando é enviada com a sessão da conta.
   Quem terminou o dia sem conta e entra antes das 23:59 ainda entra no placar daquele dia.
2. **Só no próprio dia.** Quem decide é o relógio do servidor (horário de Brasília), na hora do envio:
   a viagem completa do dia `D` só entra se chegar durante o dia `D`. Depois das 23:59, o placar do dia
   fecha e fica guardado junto com o dia (aparece nos ARQUIVOS). Viagens pelo arquivo nunca entram.
3. **Só a 1ª viagem.** Chave `(conta, dia)` com `INSERT ... ON CONFLICT DO NOTHING`. Jogar em outro
   aparelho não troca a viagem que já entrou.
4. **Pontos conferidos pelo servidor.** O navegador manda as respostas; cada uma vale no máximo os pontos
   que ela tem na lista do dia (o dobro, se é a singularidade) ou os que o juiz de IA deu. Resposta que o
   servidor não reconhece vale 0. Mexer no `localStorage` não sobe ninguém no placar.
5. Empate: fica na frente quem terminou primeiro, e ninguém divide posição. "Terminou" é a hora em que a viagem completa chegou ao servidor (no mesmo segundo, a ordem de chegada). Os empatados mostram essa hora (Brasília) ao lado dos pontos.

Limites que continuam (já estavam em `docs/ARQUIVOS.md`): `jogo/dados.js` tem as respostas de todos
os dias, e quem joga primeiro sem conta (ou em outra aba anônima) vê as perguntas antes. O placar é
para diversão, não para prêmio.

## Progresso salvo

Os registros do navegador (`nicho:v7:<dia>`) vão para a tabela `progresso`:

- ao entrar, o navegador manda tudo o que tem e recebe tudo o que a conta tem;
- ao terminar uma viagem, manda aquele dia (um envio só por dia, não um por resposta);
- conflito entre aparelhos: vale a viagem completa que chegou primeiro à conta (a mesma do placar);
  sem nenhuma completa, a mais adiantada.

Sequência e recorde saem desses registros, então vêm junto. As **skins** também ficam na conta
(`contas.extras`): as liberadas, a escolhida e o código de apoiador. O Neil vem do navegador; a **Laika** só
entra na conta com um código `NICHO-XXXX-XXXX` de Pix aprovado, conferido pelo servidor na tabela `apoios`.
Num aparelho novo, entrar na conta já libera as duas e equipa a escolhida.

## Apelidos: como evitar nomes preconceituosos

Quatro camadas (código em `servidor/apelidos.js` e `servidor/conta.js`):

1. **Formato:** 3 a 16 caracteres, só letras, números, espaço, `_` e `-`. Nada de link, emoji ou
   símbolo. Apelido único (sem diferenciar maiúsculas, acentos e separadores). Até 5 trocas por dia.
2. **Listas** em `dados/apelidos-proibidos.js`, conferidas depois de desfazer os disfarces: acentos,
   números no lugar de letras (`n4z1`), separadores (`h.i.t.l.e.r`), letras repetidas (`viiiado`),
   trocas de som (`k`/`c`, `y`/`i`, `ph`/`f`). A lista `dentro` barra em qualquer parte do apelido;
   a `inteiras` só a palavra inteira (para "puta" não barrar "Computador", nem "viado" barrar "Desviado").
   Teste: `node scripts/testar_apelidos.mjs` (apelidos que devem ser barrados e que devem passar).
3. **Juiz de IA** (o mesmo Workers AI do juiz das respostas, mesma cota): pega o que escapa das listas,
   como trocadilhos e outras línguas. Se a IA estiver fora do ar, valem só as listas.
4. **Denúncia:** no placar, quem está logado toca em ⚑ ao lado de um apelido (duas vezes, para confirmar).
   Com **3 denúncias de contas diferentes**, o apelido sai do ar na hora, o dono volta para
   "Viajante-0000" e aquele apelido fica barrado para todos (`apelidos_barrados`). Cada conta faz no
   máximo 10 denúncias por dia.

Para barrar um apelido à mão:

```sql
INSERT INTO apelidos_barrados (chave, origem) VALUES ('apelidosemacentoesemespaco', 'manual');
```

Para desfazer uma denúncia injusta: `DELETE FROM apelidos_barrados WHERE chave = '...';`.
Para ver as denúncias: `SELECT apelido, COUNT(*) FROM denuncias GROUP BY alvo, apelido ORDER BY 2 DESC;`.

## Privacidade

Do Google fica só o SHA-256 do identificador da conta (`sub`). Nada de nome, e-mail ou foto. A sessão é
um cookie HttpOnly (`nicho_sessao`, 180 dias); no banco fica só o SHA-256 dele. **EXCLUIR CONTA** apaga
conta, sessões, progresso, viagens e denúncias. Texto para o jogador: `privacidade.html` (seção 4) e
`termos.html` (seção 4).

## Como ligar (uma vez só)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ex.: "Nicho").
2. **Google Auth Platform > Branding** (tela de consentimento): app externo, nome "Nicho", e-mail de
   suporte, domínio `nichoojogo.com`, links de `https://nichoojogo.com/privacidade` e
   `https://nichoojogo.com/termos`. Não precisa de escopo extra. Em **Público-alvo**, publique o app
   (em produção). Com os escopos básicos, o Google não pede verificação.
3. **Clientes > Criar cliente > Aplicativo da Web**. Em **Origens JavaScript autorizadas**, ponha
   `https://nichoojogo.com` (e `http://localhost:8788` se for testar com o `wrangler pages dev`).
   Não precisa de URI de redirecionamento.
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele não é segredo.
5. Na Cloudflare: **Workers & Pages > nichoojogo > Settings > Variables and Secrets**, em Production,
   adicione `GOOGLE_CLIENT_ID` com esse ID. Faça um novo deploy (ou o merge do próximo PR).

As tabelas são criadas sozinhas (`banco/schema.sql`, pela action de carga do banco, e também pelas
próprias functions no primeiro uso). Sem `GOOGLE_CLIENT_ID`, o botão de conta e o placar não aparecem.

As prévias dos PRs (`*.nichoojogo.pages.dev`) não fazem login: o Google não aceita curinga nas origens.
Para testar numa prévia, adicione o endereço exato dela nas origens autorizadas.

## Arquivos

```
servidor/conta.js            login (token do Google), sessão, tabelas, progresso, conferência de pontos, IA dos apelidos
servidor/apelidos.js         formato e listas dos apelidos (sem banco, testável com node)
dados/apelidos-proibidos.js  as listas de palavras proibidas
functions/api/conta/         GET/DELETE /api/conta, POST entrar, sair, apelido, GET/POST progresso
functions/api/placar/        GET /api/placar?dia=, POST denunciar
jogo/conta.js                janela de conta, sincronização e placar no fim
scripts/testar_conta.mjs     teste do fluxo todo com um banco SQLite em memória (node scripts/testar_conta.mjs)
scripts/testar_apelidos.mjs  teste do filtro de apelidos
```

## Respostas raras no relatório de quem não está logado

- O jogo aceita as respostas do espaço profundo e a singularidade de **todo mundo**, logado ou não, e elas
  aparecem no relatório do fim de quem acertou.
- Sem login, o relatório do fim (a lista de respostas de cada pergunta) **não mostra as respostas do espaço
  profundo (60 pontos ou mais) nem a singularidade que a pessoa não pegou**, com o aviso de que elas aparecem
  para quem entra na conta. Código: `montarBanco` em `jogo/jogo.js`. Entrar na conta mostra todas.
- Isso esconde só na tela: a lista inteira do dia continua indo para o navegador (`/api/dia`).
- Dias que ainda não chegaram vão sem as raras (`servidor/dias.js`), até para quem está logado.
- `/jogo/dados.js` (todas as respostas de todos os dias) não abre no site: o `_routes.json` lista os arquivos
  de `jogo/` menos ele, e o `scripts/montar_jogo.py` refaz essa lista. Continua dentro do `jogar-completo.html`.
- Histórico: em 11/11 (#163) o dia de hoje ia sem as raras para quem não estava logado, conferidas uma a uma
  em `/api/conferir`. Jogadores sem login não conseguiam acertá-las e isso foi desfeito em 12/11. O
  `/api/conferir` e o `jogo/busca.js` (gerando `servidor/busca.js`) continuam no código, sem uso pelo jogo.

Teste: `node scripts/testar_escondidas.mjs`.

## Aviso das respostas raras no fim da viagem

Quem não está logado, ao terminar a viagem, vê uma janela (uma vez por dia neste navegador) dizendo que o
relatório esconde as respostas do espaço profundo e a singularidade que a pessoa não pegou, com o botão
"ENTRAR E VER TODAS" (abre a janela da conta). Código: `avisarRaras` em `jogo/conta.js`, janela
`#janela-raras` em `jogo/index.html`. Não aparece em jogada extra nem quando o login está desligado.

## Refazer o dia de hoje de UMA pessoa

Quando um erro do jogo atrapalhou a viagem de alguém, dá para deixar só essa pessoa jogar o dia de hoje de
novo, valendo. Cada código vale uma vez e só no dia dele (até 23:59 de Brasília).

1. No Cloudflare: **Storage & Databases > D1 > (o banco do jogo) > Console**, rode, trocando o código e o dia:

   ```sql
   INSERT INTO refazer (codigo, dia) VALUES ('PEDRO1', '2026-11-12');
   ```

   O código pode ter letras, números e "-" (de 4 a 40). Maiúscula e minúscula dão no mesmo.
2. Mande para a pessoa o link `https://nichoojogo.com/?refazer=PEDRO1`.
3. Ela abre o link **no aparelho e navegador em que jogou**. O jogo apaga a viagem de hoje daquele navegador e
   abre do começo. Se ela estiver logada, apaga também a viagem de hoje dela no servidor (progresso e placar),
   para a nova contar. Ninguém mais é afetado.

Ver quais códigos já foram usados: `SELECT * FROM refazer ORDER BY dia DESC;`. Código: `functions/api/refazer.js`.
Teste: o fim de `scripts/testar_conta.mjs`.
