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

## Respostas escondidas de quem não está logado (contra trapaça)

Antes, `/api/dia` mandava ao navegador a lista inteira do dia, com um campo `supernova` dizendo qual era a
singularidade, e o `/jogo/dados.js` (todos os dias, inclusive os que ainda não chegaram) ficava aberto no site.
Agora:

- **Sem login, o dia de hoje vem sem o espaço profundo (60 pontos ou mais) e sem a singularidade** (nem o
  nome nem a descrição). Cada categoria vem com `ocultas`: quantas respostas ficaram de fora.
  Quem está logado recebe tudo. Dias que já passaram vão completos para todo mundo; dias que ainda não
  chegaram vão sempre sem as raras. Código: `servidor/dias.js` e `functions/api/dia.js`.
- O que a pessoa digita e não está na lista recebida vai para **`POST /api/conferir`**, que procura entre as
  escondidas com a mesma busca do jogo (grafia, apelidos, plural, correção de digitação). O relógio para
  enquanto espera, como no juiz. Se não achar, segue como antes (recusada, juiz).
- A busca do jogo saiu do `jogo/jogo.js` para **`jogo/busca.js`**. O `scripts/montar_jogo.py` copia esse
  arquivo para `servidor/busca.js` (com `export`), que é o que o `/api/conferir` usa. Edite só o `jogo/busca.js`
  e rode o `montar_jogo.py`.
- Quem entra na conta no meio da viagem recebe o dia completo na hora (`completarRespostas` no `jogo.js`).
- No fim da viagem, a lista de respostas de quem não está logado mostra só as que ele recebeu, mais as
  escondidas que ele acertou, com o aviso de que o resto aparece para quem entra na conta.
- **`/jogo/dados.js` não abre mais no site** (404 pelo `functions/_middleware.js`). O `_routes.json` lista
  um por um os arquivos de `jogo/`, menos ele, e o `montar_jogo.py` refaz essa lista sozinho. Ele continua
  dentro do `jogar-completo.html` (para jogar sem internet). No site, os modos de teste `?aleatorio` e
  `?categorias=` e a página `jogo/testes.html` dependiam dele e deixam de funcionar; continuam funcionando abertos do computador.
- Custo: cada palpite que não está na lista recebida, de quem não está logado, é uma chamada ao
  `/api/conferir`. Ele guarda o dia preparado na memória por 1 minuto, então quase nunca lê o banco.
- Limite: o repositório no GitHub é público, e as listas (`dados/`) ficam lá. Para fechar de vez, deixe o
  repositório privado (Settings > General > Danger Zone > Change visibility).

Teste: `node scripts/testar_escondidas.mjs`.
