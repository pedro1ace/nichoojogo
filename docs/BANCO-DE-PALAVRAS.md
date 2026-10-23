# Banco de palavras, raridade e apelidos

Pesquisa e proposta de arquitetura para o Nicho: de onde tirar as respostas, como medir o quanto
cada uma é nichada, como usar um LLM e os jogadores para calibrar, e como aceitar apelidos e erros
sem aceitar besteira. Protótipos em `scripts/` (seção 6).

## Resumo e recomendação

1. **Não existe um banco único com "todas as palavras".** O que chega mais perto é a combinação de
   três camadas abertas: **Wikidata** para nomes próprios e entidades (planetas, países, estrelas,
   pessoas, filmes), **Wiktionary** (via kaikki.org) para o vocabulário comum, e **listas de
   frequência** (fserb/pt-br, que já usamos, e wordfreq) para saber o que é comum. Para os temas de
   espaço, as listas oficiais da IAU, NASA e IBGE servem de gabarito.
2. **Frequência de palavra mede a palavra, não a coisa.** No teste com as capitais (onde o peso foi
   dado à mão, ou seja, é a opinião de uma pessoa), o ICF e o wordfreq concordam entre si (0,92), mas
   quase nada com o peso humano (0,29 e 0,32). "Natal", "Vitória", "Boa Vista" e "Campo Grande" são
   palavras comuns, e por isso parecem óbvias, mesmo sendo capitais pouco lembradas. Para nomes
   próprios, o sinal certo é a fama da entidade: **visitas na Wikipédia em português** e **número de
   Wikipédias** em que o item existe.
3. **O que o jogo precisa medir é "quantos jogadores dariam essa resposta"**, não "quantos conhecem".
   Os sinais de corpus e Wikipédia são só um palpite inicial. A partir do lançamento, a contagem real
   dos jogadores vira o sinal principal, com uma mistura bayesiana que dá mais peso aos jogadores
   conforme eles aparecem.
4. **O LLM entra antes dos jogadores e ao lado deles, não no lugar deles.** Recomendo pedir ao modelo
   exatamente o mesmo número que os jogadores vão produzir ("de 1000 brasileiros, quantos dariam esta
   resposta?"), algumas vezes, e guardar a mediana. Assim dá para comparar direto com os jogadores e
   corrigir o LLM com o tempo. Nada de LLM em tempo real no lançamento: ele trabalha de noite, sobre
   as respostas que o jogo não reconheceu.
5. **Apelidos e intenção:** casamento em camadas (exato, sem enfeite, começo de nome, som, digitação),
   com duas travas na digitação. No teste, isso subiu os erros de digitação aceitos de **78% para 96%**
   e baixou as respostas de outras categorias aceitas por engano de **2,0% para 0,8%** (0% com uma
   lista de nomes conhecidos). Busca semântica (embeddings) serve para sugerir apelidos para revisão,
   não para aceitar resposta sozinha.

---

## 1. Fontes

Legenda de prioridade: **A** = usar já, **B** = quando precisar, **C** = só referência ou licença
complicada. Onde a licença está marcada "conferir", eu não consegui confirmar na fonte original.

### 1.1 Entidades e nomes próprios (o grosso das perguntas do Nicho)

| Fonte | O que tem | Tamanho | Licença | Uso no Nicho | Prior. |
|---|---|---|---|---|---|
| **Wikidata** (dumps JSON e API) | Cada coisa do mundo com id (Q...), classe, rótulos e **apelidos em pt/pt-br/en**, links para cada Wikipédia | ~120 milhões de itens; dump completo passa de 100 GB compactado | CC0 | Montar categorias por consulta (todas as luas, todas as constelações), apelidos, sitelinks | **A** |
| **Visitas da Wikipédia** (API de pageviews e dumps `pageview_complete`) | Visitas por artigo por dia, separando gente de robô | Dumps diários de alguns GB; a API responde por artigo | CC0 | Sinal de fama da entidade em português | **A** |
| **Wikipédia em português** (dumps) | ~1,1 milhão de artigos, **redirecionamentos** (ótima fonte de apelidos: "Phobos" → "Fobos"), listas e categorias | dump de artigos ~2–3 GB compactado | CC BY-SA 4.0 | Apelidos via redirecionamentos, listas para montar perguntas novas | **A** |
| Wikipedia Clickstream | Como os leitores navegam entre artigos | por mês, alguns GB | CC0 (conferir se tem pt) | Sinal extra de fama; opcional | C |
| DBpedia | Wikipédia em formato estruturado | grande | CC BY-SA | Redundante com o Wikidata | C |
| **IBGE** (API servicodados.ibge.gov.br) | Estados, municípios, regiões; **API de Nomes** com a frequência de nomes próprios no Censo | 5.570 municípios; ~130 mil nomes | dados públicos | Categorias de geografia brasileira; pergunta "nomes de pessoa" com frequência real | **A** |
| **IAU WGSN** (nomes oficiais de estrelas) | Lista oficial de nomes próprios de estrelas | ~500 nomes | uso livre com crédito (conferir) | Gabarito da categoria estrelas | **A** |
| **IAU/USGS Gazetteer of Planetary Nomenclature** | Nomes oficiais de crateras, montes, mares em planetas e luas | mais de 15 mil nomes | domínio público (USGS) | Perguntas bem nichadas ("uma cratera da Lua") | B |
| **Minor Planet Center / JPL SBDB** | Asteroides e objetos transnetunianos com nome | ~25 mil com nome | uso livre (conferir) | "Cite um asteroide"; muitos têm nome em homenagem a brasileiros | B |
| OpenNGC / catálogo Messier | Galáxias, nebulosas e aglomerados | ~14 mil objetos | CC BY-SA 4.0 | "Cite uma galáxia ou nebulosa" | B |
| NASA Exoplanet Archive | Exoplanetas confirmados | ~6 mil | domínio público | Pergunta nichada de exoplanetas | B |
| Unicode CLDR | Nomes de países, idiomas, moedas em pt-BR | ~250 países | licença Unicode (permissiva) | Apelidos e grafia oficial de países | B |
| GeoNames | Lugares do mundo com nomes alternativos | ~12 milhões de lugares | CC BY 4.0 | Cidades do mundo, se virar pergunta | B |
| MusicBrainz, TMDB, IMDb | Música, filmes e séries | grandes | CC0 (MusicBrainz), termos de API (TMDB), só uso não comercial (IMDb) | Perguntas de cultura pop sobre espaço ("um filme sobre o espaço") | C |

### 1.2 Vocabulário e dicionários

| Fonte | O que tem | Tamanho | Licença | Uso no Nicho | Prior. |
|---|---|---|---|---|---|
| **fserb/pt-br** (já usada) | Léxico, conjugações e ICF de pt-BR | 145.744 palavras no léxico, 419.486 no ICF | MIT | Base atual; o léxico também serve de trava na autocorreção | **A** |
| **Wiktionary via kaikki.org** | Verbetes do Wiktionary já em JSON: classe gramatical, **sinônimos, formas alternativas**, flexões | 425.855 formas em português; arquivo de 582 MB (extração de out/2026) | CC BY-SA 4.0 (do Wiktionary) | Sinônimos e grafias alternativas; perguntas de vocabulário ("um sinônimo de...") | **A** |
| VERO (corretor pt-BR do LibreOffice) | Lista de palavras válidas com regras de flexão | ~300 mil formas (conferir) | MPL/LGPL (conferir) | Validar se uma palavra existe | B |
| OpenWordNet-PT | Rede de sinônimos e conceitos | ~40 mil conceitos (conferir) | CC BY-SA (conferir) | Sinônimos, se as perguntas forem de conceito | B |
| Unitex-PB / DELAF-PB (NILC/USP) | Dicionário de formas flexionadas | ~800 mil formas (conferir) | LGPLLR (conferir) | Alternativa ao léxico fserb | C |
| Dicionário Aberto | Dicionário antigo digitalizado (pt-PT, 1913) | ~130 mil verbetes (conferir) | CC BY-SA (conferir) | Pouco útil para pt-BR atual | C |
| VOLP (ABL), Houaiss, Aurélio, Michaelis, Priberam, Dicio | Os dicionários "de verdade" | VOLP ~380 mil verbetes | fechados; só consulta | Conferência manual. **Não raspar** (termos de uso) | C |

### 1.3 Frequência e corpora (para saber o que é comum)

| Fonte | O que tem | Tamanho | Licença | Uso no Nicho | Prior. |
|---|---|---|---|---|---|
| **wordfreq** (pacote Python) | Frequência de palavras em pt juntando Wikipédia, legendas, notícias, web e Twitter | ~300 mil palavras com frequência | dados CC BY-SA 4.0 | Segundo sinal de corpus, já usado no protótipo. Congelado em 2021 (o autor parou de atualizar) | **A** |
| OpenSubtitles via OPUS (e listas derivadas, como FrequencyWords) | Legendas: linguagem falada, cultura pop | centenas de milhões de palavras em pt-BR | termos do OpenSubtitles (conferir) | Mede o que o povo fala, não o que escreve | B |
| Corpus Carolina (USP) | Corpus geral de pt-BR contemporâneo, com origem de cada texto | ~830 milhões de tokens, ~11 GB (v1.2, 2022) | CC BY-NC-SA 4.0 no geral, licença por documento | Contar nomes compostos inteiros ("Campo Grande") | B |
| BrWaC (UFRGS) | Web brasileira | 2,68 bilhões de tokens | **só pesquisa acadêmica**, não comercial | Evitar se o jogo puder virar comercial | C |
| Corpus Brasileiro (Linguateca, PUC-SP) | ~1 bilhão de palavras de pt-BR | consulta online (AC/DC) | pesquisa | Só consulta pontual | C |
| CETENFolha (Linguateca) | Folha de S.Paulo, anos 90 | ~24 milhões de palavras | pesquisa | Datado | C |
| Corpus do Português (Mark Davies) | Web e dialetos | ~1 bilhão de palavras | pago | Só consulta | C |
| FineWeb-2 / CulturaX / OSCAR (parte pt) | Web gigante para treinar modelos | dezenas de bilhões de palavras | ODC-By (FineWeb-2), outras variam | Só se quisermos contar n-gramas de nomes próprios em escala | C |
| Google Books Ngram | Frequência em livros por ano | — | — | **Não tem português** (só inglês, espanhol, francês, alemão, italiano, russo, hebraico e chinês) | — |
| Google Trends | Buscas no Google por região | — | API restrita | Boa ideia para conferência manual de casos duvidosos | C |

### 1.4 Como montar uma categoria nova com essas fontes

1. **Lista base pela classe no Wikidata** (por exemplo "satélite natural de um planeta do Sistema
   Solar") ou por uma lista da Wikipédia. Isso traz o id, o nome em pt, os apelidos e os sitelinks.
2. **Gabarito oficial** quando existir (IAU para estrelas e constelações, IBGE para municípios).
3. **LLM para o que falta** (campo `faltando` do `llm_nicho.py`): respostas certas que não estão na
   lista, para revisão humana.
4. **Curadoria**: cortar o que ninguém diria em 25 segundos, juntar duplicatas, conferir apelidos.

O gargalo continua sendo a curadoria (Etapa 2 do PIPELINE), mas os passos 1 a 3 cortam o trabalho
manual para revisar, em vez de digitar.

---

## 2. Processo analítico para pesar a raridade

### 2.1 O que o protótipo mostrou

`scripts/sinais.py` calcula, para cada resposta, o percentil de fama em cada sinal dentro da
categoria e mede a concordância entre os sinais (Spearman, 1 = mesma ordem). Rodando nas 7
categorias de hoje:

| Categoria | ICF ~ wordfreq | ICF ~ peso atual | wordfreq ~ peso atual | O peso atual é... |
|---|---|---|---|---|
| Capitais do Brasil | 0,92 | **0,29** | **0,32** | todo manual |
| Estrelas | 0,74 | 0,21 | 0,73 | quase todo manual |
| Luas | 0,91 | 0,72 | 0,39 | ICF com poucos ajustes |
| Constelações | 0,88 | 0,88 | 0,76 | ICF com 4 ajustes |
| Estados, Países, Planetas | 0,74 a 0,98 | 1,00 | 0,73 a 0,96 | só ICF |

Leitura:

- **Os dois sinais de corpus concordam entre si e discordam da pessoa** quando o peso foi dado à mão.
  Nas capitais, "Campo Grande", "Boa Vista", "Natal" e "Vitória" aparecem como óbvias porque são
  palavras comuns. "Io" (lua de Júpiter) aparece como famosa porque "io" é uma sequência comum em
  textos.
- **Falta dado para o que é mais nichado**: Éris e Sedna não estão no ICF, e caem num valor padrão.
- Nas categorias de "palavra comum" (país, estado), o corpus funciona razoavelmente.

### 2.2 Sinais recomendados

Cada sinal vira um **percentil dentro da categoria** (0 = a mais obscura, 1 = a mais famosa). Isso
tira a diferença de escala entre eles e preserva a ideia de hoje de que "Marte é óbvio para planetas".

| Sinal | Mede | Bom para | Ruim para |
|---|---|---|---|
| ICF (fserb) | frequência da palavra em texto | palavras comuns (animais, profissões, objetos) | nomes compostos e nomes que são palavras comuns |
| wordfreq | idem, com mais fontes (inclui legendas e Twitter) | idem | idem; congelado em 2021 |
| Sitelinks do Wikidata | em quantas Wikipédias o item existe (importância global) | entidades | o que é famoso só no Brasil |
| **Visitas na pt.wikipedia (12 meses)** | quanto o brasileiro procura a coisa | entidades, separa "Europa" lua de continente | palavras comuns sem artigo próprio; picos de notícia |
| **LLM: respostas em 1000** | quantos dariam esta resposta sob pressão de tempo | tudo, inclusive o "vem à cabeça primeiro" | pode errar em massa e ser confiante; precisa de conferência |
| **Jogadores** | a resposta real | tudo | só existe depois do lançamento; ruidoso com poucos jogadores |

**Peso por tipo de categoria** (ponto de partida; os jogadores vão dizer os pesos certos):

- Categoria de **entidade** (luas, estrelas, capitais, países): visitas 1,5, sitelinks 1,0,
  LLM 2,0, ICF e wordfreq 0,5 cada.
- Categoria de **palavra comum** (animais, cores, "algo que você leva para o espaço"): ICF 1,0,
  wordfreq 1,0, LLM 2,0, e sem Wikidata.

O protótipo hoje usa pesos fixos (`PESOS_SINAIS` em `scripts/sinais.py`). Separar por tipo é um
campo `# tipo: entidade` no cabeçalho da categoria.

### 2.3 Fórmula com os jogadores (depois do lançamento)

Seja `n_i` quantas vezes a resposta `i` foi dada, `N` o total de jogadores na pergunta, e `q_i` a
fatia que os sinais preveem para ela (do LLM, ou dos percentis convertidos em fatia). A estimativa
da fatia real é

```
p_i = (n_i + α · q_i) / (N + α)
```

Com `α` em torno de 200, os primeiros jogadores mexem pouco; com milhares, a contagem manda. A
pontuação sai da fatia, como no Krillion: `pontos = escala(−log10 p_i)`, e as faixas (ÓBVIA, COMUM,
INCOMUM, RARA) viram cortes de fatia (por exemplo, mais de 10% é óbvia, menos de 0,5% é rara).

`sinais.py` já faz uma versão simples disso: lê `dados/sinais/jogadores/<cat>.csv` com
`resposta,contagem` e mistura com a confiança `N / (N + 200)`.

Duas decisões de jogo que essa fórmula força (ficam em aberto):

- **Pontos congelados ou ao vivo?** Se os pontos mudam durante o dia, quem joga cedo vê um número e
  quem compartilha vê outro. Sugestão: pontos do dia calculados com os dados até o dia anterior
  (mais o palpite para perguntas novas), e recalculados de madrugada.
- **Resposta que viraliza**: se alguém posta "responde Haumea que dá muito ponto", ela deixa de ser
  rara de verdade. Com pontos congelados no dia, isso só muda no dia seguinte, e a pergunta não
  repete.

### 2.4 Surpresa e entropia (a ideia do Wordle)

A conta de Shannon usada nas análises do Wordle ajuda em parte:

- **Surpresa de uma resposta, `−log₂ p_i`**: é a mesma coisa que a fórmula da seção 2.3 (a base do
  log só muda a escala). Ou seja, os pontos em "bits de surpresa" são uma boa definição formal. Duas
  correções antes de usar:
  - `p_i` precisa ser **dentro da categoria** e vir dos jogadores (ou do palpite inicial). A
    frequência no corpus (Zipf, ICF) é surpresa da palavra, não da resposta, e a seção 2.1 mostra
    que ela erra para nomes próprios.
  - `−log p` **não tem teto**: a menor fatia possível é `1/N`, então a resposta única vale
    6,6 bits com 100 jogadores e 16,6 bits com 100 mil. Sem teto e sem a suavização com o palpite
    inicial (o `α · q_i`), a pontuação muda conforme o jogo cresce. Sugestão: limitar em algo como
    `log₂(1/0,001)` ≈ 10 bits e converter bits em pontos por uma curva fixa.
- **Entropia da categoria, `H = Σ p · log₂(1/p)`**: ideia nova e útil como diagnóstico. Fica mais
  fácil de ler como **número efetivo de respostas, `2^H`**: perto de 1 quer dizer que quase todo
  mundo dá a mesma resposta (categoria fechada e sem graça); acima de 20, as respostas se espalham.
  Serve para descartar perguntas ruins e para montar o dia com uma mistura de fechadas e abertas.
  Não precisa usar para "pagar mais" nas fechadas: a surpresa já faz isso sozinha. Cuidado: com
  poucos jogadores, a entropia medida sai mais baixa que a real, então só comparar categorias com
  número parecido de jogadores. Antes de ter jogadores, dá para calcular com os
  `respostas_em_1000` do LLM.
- **A entropia do chute** (a parte central do Wordle, escolher a palavra que mais separa as
  candidatas) não se aplica, porque no Nicho não há palavra escondida para adivinhar.

---

## 3. LLM para avaliar o quão nichada é uma resposta

Quatro opções, da mais simples para a mais cara. Recomendo **começar pela A**, usar a **C** para
descobrir respostas faltando, e deixar a **D** para quando houver servidor.

### A. Estimativa direta por categoria (protótipo: `scripts/llm_nicho.py`)

- Um pedido por categoria com a lista inteira. Para cada resposta o modelo devolve:
  `respostas_em_1000`, `conhecem_pct`, `apelidos`, `confusoes`, `observacao`, e a lista
  `faltando`. Saída em JSON com esquema fixo (structured outputs), sem precisar "limpar" texto.
- Repetir 3 vezes e ficar com a **mediana**. A **dispersão** entre as amostras mostra onde o modelo
  está chutando: essas linhas vão para revisão humana.
- Mesma escala dos jogadores, então a comparação depois é direta.
- **Custo estimado** com `claude-opus-5-5` (US$ 4 por milhão de tokens de entrada e US$ 20 de
  saída): uma categoria de 200 respostas tem uns 3 mil tokens de entrada e uns 10 mil de saída,
  cerca de **US$ 0,21 por amostra**, ou US$ 0,65 com 3 amostras. 200 categorias saem por volta de
  US$ 130, ou metade disso pela Batch API (que é assíncrona e custa 50% menos). Dá para usar um
  modelo menor se o custo pesar, mas eu mediria a qualidade antes.
- **Bônus para a supernova**: `conhecem_pct` alto com `respostas_em_1000` baixo é exatamente "poucos
  lembram, mas quem ouve reconhece". É a "graça" que o PIPELINE pede para a supernova, em número.

### B. Comparação em pares

Em vez de números absolutos, perguntar "qual destas duas um brasileiro diria primeiro?" e montar o
ranking com o modelo de Bradley-Terry. Ordens relativas costumam ser mais estáveis que números
soltos. Custa mais chamadas (dá para sortear pares em vez de fazer todos). Boa opção se a A der
números muito instáveis entre amostras.

### C. Jogadores simulados

Pedir ao modelo para fazer o papel de N jogadores diferentes (idade, região, interesse) respondendo
com 25 segundos, e contar as respostas. Serve mais para **descobrir respostas que faltam** e
erros comuns de grafia do que para pesar: LLMs tendem a dar a resposta "certinha" e a errar menos
que gente. Como a API não aceita mais `temperature` desde 21/10/2026, a variedade tem que vir das
personas no pedido.

### D. Juiz em tempo real para resposta desconhecida

Quando o casamento não acha a resposta, perguntar ao LLM "isto é uma resposta válida para a
pergunta?". Tem latência (1 a 3 s), custo por jogada e risco de aceitar coisa errada. Se um dia
for feito, só para as respostas `nao_achada`, com cache por texto normalizado, e marcando a resposta
como "pendente" até um humano confirmar. **Não recomendo no lançamento.**

### Como comparar o LLM com os jogadores

Por categoria, depois de umas centenas de jogadores:

- **Ordem**: Spearman entre `respostas_em_1000` e a contagem real (o `sinais.py` já imprime).
- **Escala**: erro médio em `log10` da fatia, porque errar 1% contra 2% importa mais que 40% contra 41%.
- **Top 5**: quantas das 5 respostas mais dadas o LLM acertou.
- **Maiores discordâncias**: lista para olhar à mão. Costumam mostrar algo do público (um filme que
  saiu, um meme) ou um viés do modelo.

Com isso dá para ajustar uma correção (regressão isotônica de "estimativa do LLM" para "fatia real")
e usar nas perguntas novas, que ainda não têm jogadores.

---

## 4. Apelidos, sinônimos e intenção

### 4.1 Casamento em camadas (protótipo: `scripts/casar.py`)

Do mais seguro para o menos seguro; para na primeira camada que achar:

1. **Exato**, sem acento, artigo ou espaço (o que o jogo já faz).
2. **Sem enfeite**: "planeta Marte", "constelação de Órion", "a lua Europa".
3. **Começo de nome composto**: "Cruzeiro" vira Cruzeiro do Sul. Se servir para mais de uma
   resposta ("Cão", "Ursa"), volta como **ambígua**, e o jogo deveria perguntar "Cão Maior ou Cão
   Menor?" em vez de chutar.
4. **Som**: chave fonética simples ("Phobos" = "Fobos", "Charon" ~ "Caronte").
5. **Digitação**, com duas travas novas:
   - a melhor opção tem que ser **única** (empate vira ambígua);
   - se o que foi digitado **já é outra palavra ou nome conhecido**, não é erro de digitação.
     "Lira" não vira Lua, e "Macapá" não vira Amapá.

Resultado de `python3 scripts/casar.py --avaliar` (erros de digitação gerados em todas as
respostas, e 2.760 respostas de outras categorias que não deveriam casar):

| | Digitação e enfeite aceitos certo | Resposta errada | Outras categorias aceitas por engano |
|---|---|---|---|
| Jogo hoje | 78,0% | 0,5% | 2,0% (56 casos, ex.: "Colômbia" → Pomba, "Miranda" → Irlanda, "Hong Kong" → Gonggong) |
| Protótipo, só com o léxico comum | **96,3%** | 0,3% | **0,8%** (23 casos, quase todos nomes próprios fora do léxico) |
| Protótipo, com lista de nomes conhecidos | 96,3% | 0,3% | **0%** |

O último número é otimista: a lista de nomes conhecidos do teste são as próprias respostas das outras
categorias. Em produção, a lista seria a de todos os rótulos em português do Wikidata, que cobre
esses casos e muito mais. A lógica está em Python; levar para `jogo/jogo.js` fica com a conversa do
front-end.

### 4.2 De onde tirar apelidos

- **Wikidata**: rótulos e apelidos em pt, pt-br e en. `scripts/buscar_wikidata.py` lista os que
  ainda não estão na categoria, para revisar.
- **Redirecionamentos da pt.wikipedia**: cada redirecionamento é um apelido que alguém já digitou.
- **Wiktionary (kaikki)**: formas alternativas e sinônimos de palavras comuns.
- **LLM**: campo `apelidos` (formas que um brasileiro escreveria) e `confusoes` (o que alguém pode
  digitar achando que é a resposta).
- **Jogadores**: a fila de respostas não reconhecidas é a melhor fonte de todas, depois do lançamento.

### 4.3 Intenção e busca semântica

Exemplo: "o planeta vermelho" para Marte, ou "a lua de Plutão" para Caronte. Busca por embeddings
(modelos multilíngues que transformam texto em vetor) acha esses casos, mas também acha parecidos
errados com muita confiança. Recomendação:

- **Não aceitar resposta por semelhança semântica em tempo real.** É o caminho para o problema "sea
  donkey" do Krillion.
- Usar embeddings e LLM **de noite**, sobre a fila de respostas não reconhecidas, para sugerir
  "isto parece apelido de X". Um humano aprova e o apelido entra no arquivo da categoria.
- Decisão de jogo em aberto: **descrição vale como resposta?** ("o planeta vermelho"). Se valer,
  entra como apelido curado, não como regra automática.

### 4.4 Confusões com graça

O campo `confusoes` do LLM permite uma mensagem amigável no lugar de "não aceito": se alguém digita
"Europa" numa pergunta de países, o jogo pode dizer "Europa é continente (mas é uma lua de Júpiter
também)". Isso é front-end, fica como sugestão.

---

## 5. Arquitetura recomendada

```
 fontes (Wikidata, Wikipédia, IAU, IBGE, Wiktionary)
        │  lista base + apelidos + id do Wikidata
        ▼
 curadoria  ◄── LLM: respostas faltando, apelidos, confusões
        │  dados/categorias/<cat>.txt
        ▼
 sinais: ICF, wordfreq, sitelinks, visitas, LLM (respostas em 1000)
        │  scripts/sinais.py → peso inicial
        ▼
 jogo do dia ── registra TODAS as respostas, inclusive as não reconhecidas
        │
        ├──► recálculo de madrugada: p_i = (n_i + α·q_i)/(N + α) → pontos de amanhã
        └──► fila de revisão: LLM sugere (apelido? resposta nova? erro?) → humano aprova
```

- **Até umas 50 categorias**, arquivos de texto no git (como hoje) bastam.
- **Para os jogadores**, precisa de um servidor guardando as respostas do dia (Etapa 3 do PIPELINE).
  Qualquer banco simples serve; o que importa é guardar o texto digitado, a categoria, o dia e o
  resultado do casamento.
- **Dumps em vez de API** quando passar de alguns milhares de itens: Wikidata e visitas têm dumps
  completos, e a API pública tem limite de uso.

---

## 6. Protótipos neste repositório

Nenhum deles mexe no jogo ou nos pesos atuais.

| Script | Faz | Testado aqui? |
|---|---|---|
| `scripts/sinais.py` | Junta os sinais, propõe `peso_novo` e mede concordância. Saída em `dados/sinais/revisao/<cat>.csv` | Sim, nas 7 categorias, com ICF e wordfreq |
| `scripts/casar.py` | Casamento em camadas; `--avaliar` compara com o jogo | Sim (números da seção 4.1) |
| `scripts/buscar_wikidata.py` | Acha o item no Wikidata, lê sitelinks, apelidos e visitas | **Só com respostas falsas**: o Wikidata e a API de visitas estão bloqueados no ambiente onde escrevi. Precisa de uma rodada de verdade |
| `scripts/llm_nicho.py` | Monta o pedido ao Claude; com `--executar`, chama a API 3 vezes e grava a mediana | O pedido e a junção das amostras, sim; a chamada à API, não (sem chave aqui) |

Ordem para rodar com internet:

```bash
pip install wordfreq anthropic
./scripts/baixar_dados.sh
python3 scripts/buscar_wikidata.py luas-do-sistema-solar
python3 scripts/llm_nicho.py luas-do-sistema-solar --executar   # precisa de ANTHROPIC_API_KEY
python3 scripts/sinais.py luas-do-sistema-solar
python3 scripts/casar.py --avaliar
```

## 7. Próximos passos sugeridos

1. Rodar `buscar_wikidata.py` em todas as categorias e conferir os itens marcados como incertos.
   Ver se visitas e sitelinks concordam com o peso manual das capitais e estrelas (a expectativa é
   bem mais que os 0,29 do ICF).
2. Rodar `llm_nicho.py` nas mesmas categorias e medir a concordância com o peso manual.
3. Com esses números, fixar os pesos dos sinais por tipo de categoria e passar o `peso_novo` para o
   `pontuar.py`.
4. Levar as camadas e travas do `casar.py` para o `jogo/jogo.js` (conversa do front-end), incluindo a
   pergunta "você quis dizer A ou B?" nas ambíguas.
5. No servidor dos jogadores: guardar todas as respostas e montar a fila de revisão noturna.

## Limitações deste trabalho

- Wikidata e Wikipédia não puderam ser acessados daqui, então ainda não há números de visitas e
  sitelinks.
- Os tamanhos e licenças marcados "conferir" vêm do meu conhecimento e não foram checados na fonte.
- Os números da seção 2.1 comparam os sinais com o peso manual, que é a opinião de uma pessoa, não
  dos jogadores.
