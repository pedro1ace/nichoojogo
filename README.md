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
  vale **100 anos-luz** de verdade (260 pontos = 26.000 AL, o centro da galáxia). As raras caem pesadas e rápidas,
  as óbvias planam devagar, e a supernova carrega, segura e mergulha em velocidade de dobra. Um tardígrado (o mascote) acompanha.
- No caminho, marcos nas distâncias reais: Alfa Centauri, Sirius, Vega, Plêiades, Betelgeuse, Nebulosa de Órion,
  Gaia BH1, Nebulosa do Anel, Nebulosa da Lagoa, Caranguejo, Pilares da Criação, Eta Carinae, Ômega Centauri,
  Aglomerado de Hércules e, no fim, Sagitário A* (o fundo vira negativo). As nebulosas e aglomerados ficam no
  fundo enquanto você responde. Também: curiosidades nas laterais, régua em anos-luz e linhas de cada faixa.
- Faixas: ÓBVIA (8 a 15 pontos), COMUM (18 a 34), INCOMUM (35 a 58), RARA (60 a 90) e a **supernova** (100),
  a resposta secreta de cada pergunta, que vale o dobro.
- A tela inteira treme mais quanto mais rara a resposta. A palavra aparece numa caixinha da cor da faixa e cai junto com a câmera; o foguete vai ao lado, acompanhando com um balanço suave.
- Autocorreção: se a palavra está quase certa (inclusive contra os apelidos), o jogo sugere e preenche o campo,
  e você confirma com LANÇAR. Ele nunca envia sozinho.
- Sons 8-bit gerados no navegador (botão ♪ para desligar).
- No fim: pontos, profundidade, diário de bordo com cada resposta, e um resultado em emoji para compartilhar.
  O progresso do dia fica salvo no navegador.

## Como jogar

Baixe o arquivo [`jogar.html`](jogar.html) e abra com dois cliques. Ele tem o jogo inteiro e funciona sem
instalar nada (só precisa de internet para as fontes pixeladas; sem internet aparece uma fonte comum).

Com o projeto todo baixado, abrir `index.html` ou `jogo/index.html` com dois cliques também funciona.

## Como atualizar as perguntas

Precisa de Python 3 (sem dependências).

```bash
./scripts/baixar_dados.sh          # baixa a base de palavras (fica fora do git)
python3 scripts/importar_listas.py # cria categorias a partir das listas prontas da base
python3 scripts/importar.py        # gera as categorias que têm receita em dados/fontes/ (Wikidata)
python3 scripts/pontuar.py         # calcula os pesos e atualiza jogo/dados.js e jogar.html
python3 scripts/agente_fama.py     # mede a fama (lembrança + Wikipédia) e roda o pontuar.py de novo
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
  agente_fama.py           agente de fama: lembrança por LLM, visitas e tendência na Wikipédia
  montar_jogo.py           gera jogo/dados.js e jogar.html
  sinais.py                protótipo: junta sinais de fama e propõe um peso novo (não mexe no jogo)
  buscar_wikidata.py       protótipo: sitelinks, visitas na Wikipédia e apelidos do Wikidata
  llm_nicho.py             protótipo: estimativa do Claude de "quantos em 1000 dariam esta resposta"
  casar.py                 protótipo: autocorreção em camadas, com --avaliar
jogar.html                 o jogo num arquivo só (gerado, não edite à mão)
jogo/                      código do jogo (HTML + CSS + JS puro, sem build)
  dados.js                 perguntas e pesos (gerado pelo pontuar.py)
  cena.js                  cena em pixel art: fundo, Terra, planetas, foguete, mascote, textos
  som.js                   sons 8-bit (Web Audio)
  jogo.js                  regras, rodada diária, salvar e compartilhar
docs/PIPELINE.md           etapas do projeto e próximos passos
docs/BANCO-DE-PALAVRAS.md  fontes de palavras, raridade, LLM e apelidos (pesquisa e proposta)
```

## Como o "quão nichada" é calculado

**Hoje todas as categorias do jogo usam o agente de fama** (`scripts/agente_fama.py`, seção abaixo). O ICF
descrito aqui é o caminho antigo, que vale quando uma categoria ainda não tem `dados/sinais/fama/<cat>.json`.

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

## Agente de fama

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
4. **Pontuação**: o `pontuar.py` usa essa fama para a ordem e aplica a mesma régua de cima.
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

## Como adicionar uma categoria

1. Crie `dados/categorias/minha-categoria.txt` com o cabeçalho `# titulo:` e `# pergunta:` e uma resposta por linha.
   Coloque apelidos e grafias alternativas na mesma linha (`Fobos | Phobos`): o jogo aceita qualquer um deles.
2. Rode `python3 scripts/pontuar.py minha-categoria`.
3. Abra `dados/pesos/revisao/minha-categoria.csv`, corrija o que estiver estranho em `dados/ajustes/`, e rode de novo.

## Fila do modo aberto (respostas que a lista não conhecia)

Nas categorias abertas, resposta fora da lista não é erro: vai para uma fila, e a fila é julgada em lote, sem LLM na hora e sem custo.

1. Ponha o que os jogadores digitaram em `dados/fila/minha-categoria.csv` (colunas `resposta,contagem`).
2. `python3 scripts/fila.py pedido minha-categoria` tira o que a lista já casa, o lixo e o já recusado, e grava o pedido em `dados/fila/pedidos/minha-categoria.md`.
3. Peça ao Claude, aqui no projeto, para julgar esse pedido. Ele devolve um JSON.
4. `python3 scripts/fila.py aplicar minha-categoria vereditos.json` põe as aceitas na lista (resposta nova ou apelido, com peso em `dados/ajustes/`), as recusadas em `dados/recusadas/` e as duvidosas em `dados/fila/revisar/`.
5. Rode `python3 scripts/pontuar.py`.

## Créditos

Base de palavras: [fserb/pt-br](https://github.com/fserb/pt-br), de Fernando Serboncini, licença MIT.

## Licença

© 2026 pedro1ace. Todos os direitos reservados. Veja [LICENSE](LICENSE), que também lista o conteúdo de terceiros (Wikidata CC0, fserb/pt-br MIT, fontes OFL).
