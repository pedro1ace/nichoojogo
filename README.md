# Nicho

Jogo diário de palavras em português, inspirado no [Krillion](https://krillion.io), com tema espacial.
O nome "Nicho" é provisório.

## Conceito

Dada uma pergunta-tema, escolha uma palavra que se encaixe. Quanto mais nichada e pouco usual a
palavra, mais pontos você ganha. O objetivo é acumular o máximo de pontos numa sessão que é remontada
todo dia com perguntas inéditas, e depois compartilhar o resultado com os amigos.

Design: 2D, sprites em pixel art, chamativo.

Como funciona hoje no protótipo:

- Até 7 perguntas por dia, as mesmas para todo mundo, com **25 segundos** cada (o relógio começa depois de uma contagem de 3).
- A viagem começa na Terra: uma descida curta, passando pela Lua, chega ao "0". Daí, cada ponto
  vale **62 anos-luz** de verdade (óbvias e letradas caem um pouco menos que isso): uns 420 pontos chegam aos 26.000 AL do centro da galáxia e ao buraco negro, ou seja, 7 respostas de espaço profundo, ou 5 delas + 1 singularidade. As raras caem pesadas e rápidas,
  as óbvias planam devagar, e a supernova carrega, segura e mergulha em velocidade de dobra. Um tardígrado (o mascote) acompanha.
- No caminho, marcos nas distâncias reais: Alfa Centauri, Sirius, Vega, Plêiades, Betelgeuse, Nebulosa de Órion,
  Gaia BH1, Nebulosa do Anel, Nebulosa da Lagoa, Caranguejo, Pilares da Criação, Eta Carinae, Ômega Centauri,
  Aglomerado de Hércules e, no fim, Sagitário A* (o fundo vira um horizonte de eventos laranja e preto). As nebulosas e aglomerados ficam no
  fundo enquanto você responde. Também: curiosidades nas laterais, régua em anos-luz e linhas de cada faixa.
- Faixas (e cores): ÓBVIA, branca (8 a 15 pontos), LETRADO, verde (18 a 34), RARO, azul (35 a 58), ESPAÇO PROFUNDO, roxa (60 a 90) e a **singularidade**, rosa (100),
  a resposta secreta de cada pergunta, que vale o dobro.
- A tela inteira treme mais quanto mais rara a resposta. A palavra aparece numa caixinha da cor da faixa e cai junto com a câmera; o foguete vai ao lado, acompanhando com um balanço suave.
- Autocorreção: se a palavra está quase certa (inclusive contra os apelidos), o jogo sugere e preenche o campo,
  e você confirma com LANÇAR. Ele nunca envia sozinho.
- Outra forma da mesma resposta vale direto, sem perguntar: plural ("Leões"), "de/e/com" a mais ou a menos
  ("arco flecha") e a palavra do tema na frente ("constelação de Órion", "língua tupi"). Regra igual em
  `jogo/jogo.js` (`chavesSoltas`) e `scripts/casar.py` (`chaves_soltas`).
- Resposta que a lista não tem: o jogo avisa que ela foi anotada para revisão (e repete isso no tempo esgotado).
- Sons 8-bit gerados no navegador (botão ♪ para desligar).
- No fim: pontos, profundidade, diário de bordo com cada resposta, e um resultado em emoji para compartilhar.
  O progresso do dia fica salvo no navegador.
- **Arquivos**: no menu e no fim, a lista dos dias anteriores para jogar (e jogar de novo). Só a 1ª viagem de
  cada dia conta (e entra na curva); o placar futuro é só de quem jogou no próprio dia. Detalhes e o plano do placar: [`docs/ARQUIVOS.md`](docs/ARQUIVOS.md).

## Como jogar

Baixe o arquivo [`jogar-completo.html`](jogar-completo.html) e abra com dois cliques. Ele tem o jogo inteiro
e funciona sem instalar nada, nem internet (as perguntas e as fontes pixeladas vão dentro do arquivo).

O `jogar.html` é a versão do site: leve (~0,4 MB), sem as perguntas dentro. Ele pede só o dia de hoje
a `/api/dia` e, se a API falhar, baixa `jogo/dados.js` na hora.

Com o projeto todo baixado, abrir `index.html` ou `jogo/index.html` com dois cliques também funciona.

## Como atualizar as perguntas

Passo a passo completo, para mexer sozinho (singularidade, raridade, categoria nova, dia de hoje e de amanhã): [`docs/TUTORIAL.md`](docs/TUTORIAL.md).

Precisa de Python 3 (sem dependências).

```bash
./scripts/baixar_dados.sh          # baixa a base de palavras (fica fora do git)
python3 scripts/importar_listas.py # cria categorias a partir das listas prontas da base
python3 scripts/importar.py        # gera as categorias que têm receita em dados/fontes/ (Wikidata)
python3 scripts/pontuar.py         # calcula os pesos e atualiza jogo/dados.js e jogar.html
python3 scripts/fama.py            # fama nova: simulação de jogadores, completude e pontos (roda o pontuar.py)
python3 scripts/fama.py --conferir # trava: toda categoria da fila tem simulação e lista completa?
```

## Estrutura

```
dados/
  categorias/<cat>.txt     respostas aceitas (uma por linha, apelidos com " | ")
  ajustes/<cat>.csv        correções manuais do peso e escolha da supernova
  fontes/<cat>.json        receita de importação do Wikidata (classe, filtros, contagem, limpeza)
  pesos/<cat>.json         saída do pontuar.py, carregada pelo jogo
  pesos/revisao/<cat>.csv  mesma saída em tabela, para revisar
  sinais/                  sinais extras (Wikidata, LLM, jogadores) e a tabela de comparação
  brutos/                  base pt-BR baixada (ignorada pelo git)
scripts/
  baixar_dados.sh          baixa a base fserb/pt-br
  importar_listas.py       transforma listas da base em categorias
  importar.py              gera categorias do Wikidata a partir de dados/fontes/<id>.json, com validações
  pontuar.py               calcula os pesos de nicho
  fama.py                  fama nova: simulação de 1000 jogadores, completude, régua fixa e a trava
  agente_fama.py           agente de fama antigo: lembrança por LLM, visitas e tendência na Wikipédia
  montar_jogo.py           gera jogo/dados.js e jogar.html
  complexidade.py          listas de palavras comuns (Termo): pontos pela frequência da palavra e --limpar tira as que não existem
  recusadas.py             palavras que os jogadores digitaram e a lista recusou
  sinais.py                protótipo: junta sinais de fama e propõe um peso novo (não mexe no jogo)
  buscar_wikidata.py       protótipo: sitelinks, visitas na Wikipédia e apelidos do Wikidata
  llm_nicho.py             protótipo: estimativa do Claude de "quantos em 1000 dariam esta resposta"
  casar.py                 protótipo: autocorreção em camadas, com --avaliar
functions/api/pontuacao.js curva dos viajantes (Cloudflare Pages Function + D1)
functions/api/respostas.js contagem anônima das respostas do dia (aceitas e recusadas)
functions/api/arquivo.js   lista dos dias anteriores para a aba ARQUIVOS (só data e temas, 30 por vez)
banco/schema.sql           tabela do D1 da curva
jogar.html                 o jogo do site num arquivo só, sem as perguntas (gerado, não edite à mão)
jogar-completo.html        o mesmo com todas as perguntas dentro, para abrir sem internet (gerado)
jogo/                      código do jogo (HTML + CSS + JS puro, sem build)
  dados.js                 perguntas e pesos (gerado pelo pontuar.py)
  cena.js                  cena em pixel art: fundo, Terra, planetas, foguete, mascote, textos
  som.js                   sons 8-bit (Web Audio)
  jogo.js                  regras, rodada diária, salvar e compartilhar
docs/TUTORIAL.md           passo a passo para manter o jogo sozinho
docs/PIPELINE.md           etapas do projeto e próximos passos
docs/BANCO-DE-PALAVRAS.md  fontes de palavras, raridade, LLM e apelidos (pesquisa e proposta)
```

## Como o "quão nichada" é calculado

**Hoje as categorias que ainda vão ao ar usam a fama por simulação de jogadores** (`scripts/fama.py`, seção
"Fama: simulação de jogadores" abaixo). O agente de fama e o ICF descritos depois são os caminhos antigos, que
valem só para quem ainda não tem `dados/sinais/lembranca/<cat>.txt`.

A base usa **ICF** (frequência inversa no corpus): quanto maior, mais rara a palavra no português em geral.
Para cada categoria, `pontuar.py` combina:

- **percentil na categoria (70%)**: a posição da resposta entre as outras da mesma categoria. "Marte" é a
  resposta óbvia de planetas mesmo não sendo uma palavra tão comum.
- **raridade global (30%)**: o ICF normalizado na base inteira.

Esse peso (ou o manual) só decide a **ordem** das respostas. Depois a **régua da categoria** espalha essa ordem
pelas faixas do jogo, para toda categoria ter de tudo. O peso de antes fica na coluna `fama` de
`dados/pesos/revisao/<cat>.csv`.

| Faixa | Parte da lista | Pontos |
|---|---|---|
| Óbvia | as 2% mais famosas (de 3 a 15 respostas) | 8 a 15 |
| Comum | as 5% seguintes (de 5 a 40) | 18 a 34 |
| Incomum | as 15% seguintes (de 10 a 150) | 35 a 58 |
| Rara | todo o resto | 60 a 90 |
| Supernova | uma por categoria | 100 (50, dobrada no jogo) |

Como no Krillion, as faixas baixas são estreitas de propósito: quem joga digita quase sempre as respostas mais
famosas, então só as bem óbvias ficam cinzas, e a cauda longa (que pode ter milhares de respostas) é rara. Os cortes de faixa no jogo (`FAIXAS` em `jogo/cena.js`) são 18, 35 e 60 pontos.

Categorias pequenas e fechadas (menos de 30 respostas) não dão para espalhar e ficam fora do jogo, listadas em
`dados/fora_do_jogo.txt`. Os arquivos continuam no repositório.

O ICF mede a palavra, não o significado, então erra quando a resposta é uma palavra comum com outro
sentido ("Mesa" é uma constelação bem obscura, "Europa" é uma lua). Respostas que não estão na base saem
com `sem_dado=True`. Os dois casos se corrigem em `dados/ajustes/<cat>.csv`:

```csv
resposta,peso,supernova
Mesa,85,
Cabeleira de Berenice,,1
```

`peso` vai de 0 a 100 e substitui o calculado na ordem da categoria; `supernova=1` escolhe a resposta secreta (senão, é a de mais pontos).

## Fama: simulação de jogadores

O jeito antigo (agente de fama, abaixo) tinha dois defeitos que voltavam todo dia, porque nenhuma categoria se
repete e um erro no ar não tem conserto:

1. As listas crescem (importações da Wikipédia), a estimativa não era refeita, e toda resposta sem estimativa
   contava como "ninguém lembra": virava rara. Coentro em Legumes valia 90.
2. Visitas na Wikipédia e frequência em textos medem a fama **geral**, não o quanto alguém diria aquilo para
   **aquela** pergunta.

O jeito novo (`scripts/fama.py`), para toda categoria, antes de ela ir ao ar:

1. **Simulação** (`dados/sinais/lembranca/<cat>.txt`): 1000 jogadores variados respondem à pergunta como no jogo,
   **sem ver a lista**. A contagem (soma 1000) é a fama. Linha `Nome 12` = 12 em 1000; `Dito = Nome na lista 3`
   quando o jogador escreveria diferente; `! Nome 4` = gente diz, mas não vale; `~ Nome 6` = **criativa**; `@ Nome 2` = **espertalhão**.
2. **Criativa** (`~`): associação lateral, não um exemplo literal da pergunta (Homer Simpson em Coisas amarelas,
   Panela em Instrumentos). A IA só marca se é criativa, não chuta quantos diriam. Vale no mínimo 70 (`PONTOS_CRIATIVA`).
   **Espertalhão** (`@`, marcado à mão): o clichê esperto que muita gente dá ("O tempo" em Coisas que voam).
   Faixa própria, laranja, 15 pontos fixos (`PONTOS_ESPERTALHAO`). Nunca é a singularidade.
3. **Completude**: o que a simulação diz e a lista não aceita é resposta ou apelido faltando
   (`dados/sinais/revisao/faltando.csv`). `--completar` põe na lista (apelido vai na linha da resposta).
   `suspeitas.csv` lista o que a estimativa antiga achava comum e a simulação esqueceu.
4. **Fora da simulação, é rara.** Visitas, frequência em textos e a estimativa antiga só ordenam a cauda.
5. **Régua fixa** (`REGUA_FIXA` no `pontuar.py`): óbvia com 15 ou mais em 1000 (8 a 15 pontos), comum de 4 a 15
   (18 a 34), incomum de 1 a 4 (35 a 58), rara abaixo de 1 (60 a 90, pela ordem da cauda). O mesmo número quer
   dizer a mesma coisa em toda categoria.
6. **O % do diário de bordo** ("mais nichada que X% dos jogadores") é `acima`: a parte dos 1000 simulados que daria
   uma resposta mais óbvia. Antes era a parte da lista com menos pontos, e Panela aparecia como "6%".
7. **Trava**: `python3 scripts/fama.py --conferir` falha se alguma categoria de hoje em diante não tem simulação,
   se a pergunta mudou ou se falta resposta na lista. O `montar_jogo.py` avisa das que faltam.
8. **Respostas repetidas**: duas linhas da lista que são a mesma resposta ("Coalho" e "Queijo de coalho",
   "Abridor de lata" e "Abridor de latas") ganhavam pontos separados, e quem digitava a forma longa levava 72 por
   uma resposta óbvia. O `--conferir` trava nas categorias de amanhã e avisa nas outras; `--completar` junta cada
   grupo na linha mais lembrada, com as outras formas como apelidos. Confira o grupo antes: às vezes um apelido
   errado liga duas respostas diferentes.

```bash
python3 scripts/fama.py --simular minha-categoria   # gera a simulação com o Claude (ANTHROPIC_API_KEY)
python3 scripts/fama.py minha-categoria --completar # casa com a lista, completa o que falta e pontua
python3 scripts/fama.py --conferir                  # antes de subir: tudo da fila passou?
```

Sem chave de API, a simulação pode ser escrita pelo Claude aqui no projeto: peça "simule 1000 jogadores para
a categoria X" e ele grava o arquivo no formato acima.

**Respostas reais**: o jogo manda cada resposta (aceita ou recusada) para `/api/respostas`
(`functions/api/respostas.js`, tabelas em `banco/schema.sql`), só com o dia, a categoria e a palavra. Não mexe nos
pontos (ainda há poucos jogadores, ficaria volátil, e a categoria nunca volta). Serve para as recusadas virarem
candidatas na fila e para, somando semanas, medir onde a simulação erra. Para ligar, rode de novo o
`banco/schema.sql` no Console do D1.

## Agente de fama (antigo)

O ICF e as visitas medem o quanto se **lê** sobre uma coisa. O jogo precisa do quanto ela vem à **cabeça**
de quem responde: Malta aparece muito em notícias, mas quase ninguém diz "Malta" quando pedem um país.
O agente mede isso e reordena cada categoria:

1. **Lembrança** (`dados/sinais/llm/<cat>.json`): "se 1000 brasileiros respondessem, quantos dariam esta
   resposta?" e "quantos por cento reconheceriam?". Feito por um LLM, em lotes, e guardado: o agente só
   pergunta o que ainda não está no arquivo. Sem `ANTHROPIC_API_KEY`, usa só o que já está lá.
   Só as respostas que alguém lembra foram estimadas (umas 4 mil). As outras contam como "ninguém lembra",
   nunca como média, e se ordenam entre si pelos outros sinais: assim uma resposta nichada nova cai em rara.
2. **Wikipédia** (`dados/sinais/wikidata/<cat>.json`): visitas em 12 meses e **tendência** (últimos 6 meses
   contra os 6 anteriores), dos dumps de `scripts/baixar_visitas.sh`. Quem está em alta sobe um pouco.
3. **Mistura**: lembrança 65%, reconhecimento 10%, o peso manual antigo de `dados/ajustes/` 15%, visitas 7%
   e frequência em textos 3%.
   A tendência soma ou tira até 0,05. O resultado vai para `dados/sinais/fama/<cat>.json`.
4. **Pontuação**: o `pontuar.py` usa essa fama para a ordem e aplica a mesma régua de cima, mas a cota de
   cada faixa vira um teto: para ser óbvia a resposta precisa que pelo menos 5 em 1000 a digam, comum 1 em 1000 e
   incomum 0,1 em 1000 (`LEMBRANCA_MINIMA`). Assim, numa lista de 4 mil asteroides em que só uns 40 vêm à cabeça
   de alguém, o resto é todo raro, em vez de nomes que ninguém diria ocuparem as vagas de incomum.
   `dados/sinais/revisao/agente-mudancas.csv` lista tudo que mudou de faixa, com os sinais de cada resposta.

```bash
export ANTHROPIC_API_KEY=...        # opcional: só para estimar respostas novas
pip install anthropic                # idem
./scripts/baixar_visitas.sh          # opcional: 12 meses de visitas (uns 6 GB por mês de download, fora do git)
python3 scripts/buscar_wikidata.py --so-visitas   # atualiza as visitas com os dumps
python3 scripts/agente_fama.py       # ou --so-relatorio para só recombinar o que já existe
```

Com o agente, a coluna `peso` de `dados/ajustes/` vira um dos sinais em vez de mandar sozinha (quase toda
categoria tinha peso escrito para todas as respostas). A coluna `supernova` continua mandando. Para corrigir
uma resposta, mude a lembrança dela no `dados/sinais/llm/<cat>.json` e rode `agente_fama.py --so-relatorio`.

## Regras do banco de perguntas

- **Nenhuma categoria se repete.** Os dias saem da fila em `dados/ordem.txt`: o dia #1 (28/10/2026)
  usa as 7 primeiras, o dia #2 as 7 seguintes, e assim por diante. Nunca reordene nem apague as
  linhas de dias que já passaram. Categoria nova entra sozinha no fim da fila quando o
  `montar_jogo.py` roda, e ele avisa até que dia a fila dá. São 7 categorias novas por dia (49 por semana).
  A lista legível de cada dia (data, perguntas e quantas respostas cada uma tem) fica em [`DIAS.md`](DIAS.md).
- **Toda categoria aberta tem pelo menos 1000 respostas antes de ir ao ar.** Categorias fechadas
  (elementos, constelações, países, ossos, capitais, Tom Hanks, Turma da Mônica, esportes olímpicos, craques da Seleção, astronautas, novelas,
  astro e cosmo) são exceção e ficam com o tamanho real; a lista está em `FECHADAS`, no
  `scripts/montar_jogo.py`, que avisa de toda categoria aberta da fila abaixo de 1000.
- **O jogo é para todas as idades.** Nada de resposta sobre sexo, drogas, bebedeira, cigarro ou
  palavrão, nem em categoria engraçada. Bebida alcoólica pode (cerveja, cachaça, quentão); bebedeira não.
- A pontuação premia o quão nichada ou complexa é a resposta, e a singularidade vale mais que tudo.

## Como adicionar uma categoria

1. Crie `dados/categorias/minha-categoria.txt` com o cabeçalho `# titulo:` e `# pergunta:` e uma resposta por linha.
   Coloque apelidos e grafias alternativas na mesma linha (`Fobos | Phobos`): o jogo aceita qualquer um deles.
2. Faça a simulação de 1000 jogadores (`dados/sinais/lembranca/minha-categoria.txt`, seção "Fama: simulação de
   jogadores") e rode `python3 scripts/fama.py minha-categoria --completar`.
3. Abra `dados/pesos/revisao/minha-categoria.csv`, corrija o que estiver estranho em `dados/ajustes/`, e rode de novo.

## Fila do modo aberto (respostas que a lista não conhecia)

Nas categorias abertas, resposta fora da lista não é erro: vai para uma fila, e a fila é julgada em lote, sem LLM na hora e sem custo.

1. Ponha o que os jogadores digitaram em `dados/fila/minha-categoria.csv` (colunas `resposta,contagem`).
2. `python3 scripts/fila.py pedido minha-categoria` tira o que a lista já casa, o lixo e o já recusado, e grava o pedido em `dados/fila/pedidos/minha-categoria.md`.
3. Peça ao Claude, aqui no projeto, para julgar esse pedido. Ele devolve um JSON.
4. `python3 scripts/fila.py aplicar minha-categoria vereditos.json` põe as aceitas na lista (resposta nova ou apelido, com peso em `dados/ajustes/`), as recusadas em `dados/recusadas/` e as duvidosas em `dados/fila/revisar/`.
5. Rode `python3 scripts/pontuar.py`.

## Curva dos viajantes (site no ar)

No fim da viagem, o jogo mostra uma curva com a pontuação de todo mundo que jogou o mesmo dia e marca onde
você ficou ("você foi mais fundo que 73% dos 1.204 viajantes de hoje"). Funciona só no site publicado
no Cloudflare Pages; no `jogar.html` aberto do computador a seção não aparece.

- `functions/api/pontuacao.js` recebe `{dia, pontos}` no fim de cada viagem e devolve a curva do dia.
- Guarda só um histograma: por dia, quantas viagens terminaram em cada faixa de 10 pontos. Nada de IP,
  nome, cookie ou respostas. Cada navegador manda uma vez por dia (marca `nicho:enviado:<dia>` no
  `localStorage`); o modo teste (`?aleatorio`) só lê a curva.
- Com menos de 5 viagens no dia, aparece uma frase no lugar da curva.

Configuração no Cloudflare (uma vez só):

1. **Workers & Pages → D1 SQL Database → Create**, com o nome `nicho`.
2. No banco criado, aba **Console**, cole e rode o conteúdo de [`banco/schema.sql`](banco/schema.sql).
3. No projeto do Pages: **Settings → Bindings → Add → D1 database**, nome da variável `DB`, banco `nicho`
   (em Production e, se quiser testar, em Preview).
4. Faça um novo deploy (ou reenvie o último) para a função pegar o banco.

Carga automática dos dias: a action [`carga-banco.yml`](.github/workflows/carga-banco.yml) sobe
`banco/carga_dias.sql` para o D1 sempre que ele muda no `main`. Ela precisa de dois segredos do repositório
(**Settings → Secrets and variables → Actions**): `CLOUDFLARE_API_TOKEN` (token com permissão
**Account → D1 → Edit**) e `CLOUDFLARE_ACCOUNT_ID`.

Juiz das recusadas (IA): quando a lista não tem a resposta, [`functions/api/juiz.js`](functions/api/juiz.js)
pergunta ao Workers AI da Cloudflare se ela vale. Se a IA disser SIM, vale 40 pontos na hora; NÃO e TALVEZ seguem
para a revisão diária (o veredito sai no campo `ia` de `/api/respostas?recusadas=1`). Cada resposta é julgada uma vez
só (tabela `vereditos`, que guarda também o nome no padrão, para juntar as formas da mesma resposta) e há um teto de 700 julgamentos por dia, dentro dos 10.000 neurônios grátis da Cloudflare.
Para ligar: no projeto do Pages, **Settings → Bindings → Add → Workers AI**, nome da variável `AI`, e um novo deploy.
Sem esse binding, o jogo recusa como antes. Para o jogador nada indica que existe IA; os avisos da "central"
aparecem só nas prévias (`*.pages.dev`). Diagnóstico (não gasta nada): `GET /api/juiz`.

Para testar no computador: `npx wrangler pages dev . --d1 DB=nicho-local --ai AI`, depois crie a tabela com
`banco/schema.sql` no banco local.

## Domínio

O endereço oficial é **https://nichoojogo.com** (comprado no Cloudflare). No projeto do Pages, em
**Custom domains**, ficam `nichoojogo.com` e `www.nichoojogo.com`. O arquivo
[`functions/_middleware.js`](functions/_middleware.js) manda `www.nichoojogo.com` e o endereço velho
`nichoojogo.pages.dev` para `nichoojogo.com`, e o [`_routes.json`](_routes.json) faz ele rodar só nas páginas
e na API. O contato aparece como `contato@nichoojogo.com`, mas o link abre um e-mail para `nichoojogo@gmail.com`. Instagram: [@nichoojogo](https://www.instagram.com/nichoojogo/).

## Créditos

Base de palavras: [fserb/pt-br](https://github.com/fserb/pt-br), de Fernando Serboncini, licença MIT.
A lista completa, que o jogador vê, está em [`creditos.html`](creditos.html). Termos de uso em [`termos.html`](termos.html).

## Licença

© 2026 pedro1ace e cincoano. Todos os direitos reservados. Veja [LICENSE](LICENSE), que também lista o conteúdo de terceiros (Wikidata CC0, fserb/pt-br MIT, fontes OFL).
