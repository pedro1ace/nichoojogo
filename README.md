# Nicho

Jogo diário de palavras em português, inspirado no [Krillion](https://krillion.io), com tema espacial.
O nome "Nicho" é provisório.

## Conceito

Dada uma pergunta-tema, escolha uma palavra que se encaixe. Quanto mais nichada e pouco usual a
palavra, mais pontos você ganha. O objetivo é acumular o máximo de pontos numa sessão que é remontada
todo dia com perguntas inéditas, e depois compartilhar o resultado com os amigos.

Design: 2D, sprites em pixel art, chamativo.

Como funciona hoje no protótipo:

- Até 7 perguntas por dia, as mesmas para todo mundo (sorteio pela data).
- Uma resposta por pergunta e 3 tentativas ("combustível") para acertar uma resposta válida.
- Os pontos são **anos-luz**: respostas óbvias valem quase nada, nichadas levam o foguete longe.
- Cada pergunta esconde uma **supernova**, a resposta secreta que vale o dobro (o "krillion" do original).
- Faixas de pontos com sprite próprio: 🛰️ satélite (até 14), 🌙 lua (15 a 49), 🪐 planeta (50+), 🌟 supernova.
- No fim, um resultado em emoji para colar no grupo. O progresso do dia fica salvo no navegador.

## Como rodar

Precisa só de Python 3 (sem dependências) e um navegador.

```bash
./scripts/baixar_dados.sh          # baixa a base de palavras (fica fora do git)
python3 scripts/importar_listas.py # cria categorias a partir das listas prontas da base
python3 scripts/pontuar.py         # calcula o peso de nicho de cada resposta
python3 -m http.server 8000        # sirva a pasta do projeto
```

Abra <http://localhost:8000/jogo/>. O jogo precisa ser servido por HTTP (abrir o arquivo direto não funciona,
porque ele carrega os JSON com `fetch`).

## Estrutura

```
dados/
  categorias/<cat>.txt     respostas aceitas (uma por linha, apelidos com " | ")
  ajustes/<cat>.csv        correções manuais do peso e escolha da supernova
  pesos/<cat>.json         saída do pontuar.py, carregada pelo jogo
  pesos/revisao/<cat>.csv  mesma saída em tabela, para revisar
  brutos/                  base pt-BR baixada (ignorada pelo git)
scripts/
  baixar_dados.sh          baixa a base fserb/pt-br
  importar_listas.py       transforma listas da base em categorias
  pontuar.py               calcula os pesos de nicho
jogo/                      protótipo do jogo (HTML + CSS + JS puro, sem build)
  cena.js                  sprites em pixel art e animação do foguete
  jogo.js                  regras, rodada diária, salvar e compartilhar
docs/PIPELINE.md           etapas do projeto e próximos passos
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
