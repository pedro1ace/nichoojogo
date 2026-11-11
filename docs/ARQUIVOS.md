# Arquivos: dias anteriores (e o placar que vem depois)

## O que o jogador vê

- Botão **ARQUIVOS** (ícone de pasta em pixel art) no menu inicial e no relatório do fim. Abre a lista
  dos dias que já passaram (o dia de hoje nunca aparece), com a sua situação em cada um. Os temas só
  aparecem depois que você termina o dia; para quem não jogou, são surpresa:
  `NÃO JOGADO`, `PELA METADE` ou `312 PTS · NO DIA` / `312 PTS · PELO ARQUIVO`.
- **JOGAR** abre o dia em `nichoojogo.com/dia/5` (o número do dia, como aparece no jogo). Se você
  nunca jogou aquele dia, essa é a sua 1ª viagem dele. Links velhos (`/?arquivo=2026-11-01`) continuam
  abrindo e trocam sozinhos para o endereço limpo. Fora do site (arquivo aberto do computador ou
  `/jogo/`) o endereço segue sendo `?arquivo=2026-11-01`.
- Dia já terminado: **VER RELATÓRIO** (a sua 1ª viagem) e **↻ JOGAR NOVAMENTE**
  (`/dia/5?novamente`; o `?novamente` some da barra assim que a página abre, e um F5 no meio da
  jogada extra continua nela). A jogada extra mostra em amarelo que não conta e qual é a
  pontuação que vale.
- O dia de hoje não tem "jogar novamente".
- **★ SEU RECORDE** no menu e no fim: a maior pontuação entre as suas 1ªs viagens (jogadas extras
  ficam fora).

## As regras

1. **Só a 1ª viagem de cada dia conta.** Ela nunca é sobrescrita. Jogar de novo é só por diversão.
2. **Curva dos viajantes:** todo dia mostra a curva. A 1ª viagem de um dia ainda não jogado entra
   nela, mesmo feita depois, pelo arquivo. Jogadas extras não são enviadas.
3. **Placar (futuro): só quem jogou no próprio dia.** Quem jogou pelo arquivo entra na curva, mas não
   no placar.
4. A contagem de respostas (`/api/respostas`) continua só com quem joga no dia, para não misturar
   a fama de dias diferentes.
5. Uma viagem pelo arquivo **não emenda a sequência** de dias seguidos (nem libera skin).

## Por que não pesa com o tempo

- A lista vem de `/api/arquivo`, 30 dias por vez ("carregar dias mais antigos"), e lê só a tabela
  `resumo_dias` (data, número e temas, poucos bytes por dia). Nunca abre os pacotes grandes.
- As perguntas de um dia só são baixadas quando alguém abre aquele dia (`/api/dia`, com cache na CDN).
- No navegador ficam no máximo duas chaves por dia (`nicho:v7:<dia>` e `nicho:replay:<dia>`), com
  pouca coisa cada. Jogar de novo várias vezes não acumula.

Para atualizar o banco não precisa rodar nada: quando `banco/carga_dias.sql` muda no `main`, a
action `.github/workflows/carga-banco.yml` carrega as duas tabelas sozinha (dá para ver em
**Actions > Carga do banco**, e rodar na mão pelo botão "Run workflow"). Ela usa os segredos
`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` do repositório.

Se um dia precisar rodar no computador, o comando continua sendo:

```
npx wrangler d1 execute nicho --remote --file=banco/carga_dias.sql
```

## Como fica guardado no navegador

```
nicho:v7:<dia>      a 1ª viagem: { historico, total, inicio, fim, noDia }
nicho:replay:<dia>  a última jogada extra: { historico, total }
```

`inicio` e `fim` são os dias (no relógio do jogador) em que a viagem começou e terminou, e `noDia`
diz se terminou no próprio dia. Registros antigos, de antes dos arquivos, não têm `noDia` e contam
como feitos no dia.

## Placar diário com conta

Feito: login opcional com Google, progresso salvo na conta e placar do dia. Regras e como ligar em
[`docs/CONTA.md`](CONTA.md). Em resumo: só quem está logado, só a 1ª viagem, só no próprio dia
(relógio do servidor, fecha às 23:59 de Brasília), pontos conferidos pelo servidor. O placar de cada
dia aparece no fim daquele dia, também pelos arquivos.
