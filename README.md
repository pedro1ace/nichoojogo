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
- A viagem começa na Terra, com o céu claro. Cada resposta faz o tardígrado viajar `pontos × 10` anos-luz,
  sempre no mesmo tempo: as raras descem rápido e as óbvias quase não saem do lugar. Um tardígrado de capacete (o mascote) acompanha.
- No caminho: marcos (Lua, Marte, Júpiter... buraco negro), curiosidades nas laterais, régua de profundidade
  e linhas mostrando até onde cada faixa de raridade levaria nesta pergunta.
- Faixas: ÓBVIA (0 a 4), COMUM (5 a 19), INCOMUM (20 a 49), RARA (50+) e a **supernova**,
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

A base usa **ICF** (frequência inversa no corpus): quanto maior, mais rara a palavra no português em geral.
Para cada categoria, `pontuar.py` combina:

- **percentil na categoria (70%)**: a posição da resposta entre as outras da mesma categoria. "Marte" é a
  resposta óbvia de planetas mesmo não sendo uma palavra tão comum.
- **raridade global (30%)**: o ICF normalizado na base inteira.

`pontos = 100 × peso²`, com mínimo de 1. A curva faz as respostas óbvias valerem quase nada.

O ICF mede a palavra, não o significado, então erra quando a resposta é uma palavra comum com outro
sentido ("Mesa" é uma constelação bem obscura, "Europa" é uma lua). Respostas que não estão na base saem
com `sem_dado=True`. Os dois casos se corrigem em `dados/ajustes/<cat>.csv`:

```csv
resposta,peso,supernova
Mesa,85,
Cabeleira de Berenice,,1
```

`peso` vai de 0 a 100 e substitui o calculado; `supernova=1` escolhe a resposta secreta (senão, é a de mais pontos).

## Como adicionar uma categoria

1. Crie `dados/categorias/minha-categoria.txt` com o cabeçalho `# titulo:` e `# pergunta:` e uma resposta por linha.
   Coloque apelidos e grafias alternativas na mesma linha (`Fobos | Phobos`): o jogo aceita qualquer um deles.
2. Rode `python3 scripts/pontuar.py minha-categoria`.
3. Abra `dados/pesos/revisao/minha-categoria.csv`, corrija o que estiver estranho em `dados/ajustes/`, e rode de novo.

## Créditos

Base de palavras: [fserb/pt-br](https://github.com/fserb/pt-br), de Fernando Serboncini, licença MIT.
