# Arquivos: dias anteriores (e o placar que vem depois)

## O que o jogador vê

- Botão **ARQUIVOS** no menu inicial e no relatório do fim. Abre a lista dos dias que já passaram
  (o dia de hoje nunca aparece), com os 7 temas de cada um e a sua situação:
  `NÃO JOGADO`, `PELA METADE` ou `312 PTS · NO DIA` / `312 PTS · PELO ARQUIVO`.
- **JOGAR** abre o dia em `/jogar?arquivo=2026-11-01`. Se você nunca jogou aquele dia, essa é a sua
  1ª viagem dele.
- Dia já terminado: **VER RELATÓRIO** (a sua 1ª viagem) e **↻ JOGAR NOVAMENTE**
  (`?arquivo=2026-11-01&novamente`). A jogada extra mostra em amarelo que não conta e qual é a
  pontuação que vale.
- O dia de hoje não tem "jogar novamente".

## As regras

1. **Só a 1ª viagem de cada dia conta.** Ela nunca é sobrescrita. Jogar de novo é só por diversão.
2. **Curva dos viajantes e placar são só de quem jogou no próprio dia.** Viagens pelo arquivo e jogadas
   extras não são enviadas para `/api/pontuacao` nem para `/api/respostas`. O servidor também recusa
   POST de dia que já passou.
3. Uma viagem pelo arquivo **não emenda a sequência** de dias seguidos (nem libera skin).

## Por que não pesa com o tempo

- A lista vem de `/api/arquivo`, 30 dias por vez ("carregar dias mais antigos"), e lê só a tabela
  `resumo_dias` (data, número e temas, poucos bytes por dia). Nunca abre os pacotes grandes.
- As perguntas de um dia só são baixadas quando alguém abre aquele dia (`/api/dia`, com cache na CDN).
- No navegador ficam no máximo duas chaves por dia (`nicho:v7:<dia>` e `nicho:replay:<dia>`), com
  pouca coisa cada. Jogar de novo várias vezes não acumula.

Para atualizar o banco, o mesmo comando de sempre carrega as duas tabelas:

```
npx wrangler d1 execute DB --remote --file=banco/carga_dias.sql
```

## Como fica guardado no navegador

```
nicho:v7:<dia>      a 1ª viagem: { historico, total, inicio, fim, noDia }
nicho:replay:<dia>  a última jogada extra: { historico, total }
```

`inicio` e `fim` são os dias (no relógio do jogador) em que a viagem começou e terminou, e `noDia`
diz se terminou no próprio dia. Registros antigos, de antes dos arquivos, não têm `noDia` e contam
como feitos no dia.

## Placar diário com conta (futuro, ainda não feito)

O navegador não serve de prova para placar (qualquer um edita o localStorage). Quando houver login:

1. Tabela `viagens` no D1 (rascunho comentado em `banco/schema.sql`) com chave `(conta, dia)`.
   O envio usa `INSERT ... ON CONFLICT DO NOTHING`: a 1ª viagem fica e as outras são ignoradas,
   sem depender do jogo.
2. `no_dia` é decidido pelo **relógio do servidor** na hora do envio (dia do jogo = hoje, com folga
   de fuso), nunca pelo que o navegador diz.
3. Só a viagem de quem está logado vai para `viagens`. Jogadas extras nunca são enviadas.
4. O placar de cada dia: `SELECT ... FROM viagens WHERE dia = ? AND no_dia = 1 ORDER BY pontos DESC LIMIT 100`.
   Nos arquivos, cada dia mostra o seu placar com essa mesma consulta.
5. Ao entrar na conta pela 1ª vez, as viagens já guardadas no navegador podem aparecer no perfil,
   mas **não entram no placar** (não dá para provar quando foram feitas).
6. Antes do placar valer: `/api/dia` hoje entrega qualquer dia, inclusive os futuros, e o `jogar.html`
   leva todas as perguntas dentro. Para um placar justo, o servidor deveria conferir as respostas
   (ou ao menos não entregar dias futuros).
