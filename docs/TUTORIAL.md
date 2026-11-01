# Tutorial: manter o Nicho sozinho

Guia passo a passo para mexer no jogo sem ajuda. Tudo aqui foi testado com os scripts do repositório.

Sumário:

0. [Preparar o computador (uma vez só)](#0-preparar-o-computador-uma-vez-só)
1. [Mudar a singularidade ou a raridade de uma palavra](#1-mudar-a-singularidade-ou-a-raridade-de-uma-palavra)
2. [A fórmula da fama (e como gerar a simulação de uma categoria nova)](#2-a-fórmula-da-fama)
3. [Adicionar uma categoria nova com as respostas](#3-adicionar-uma-categoria-nova)
4. [Mudar algo do dia que já está no ar](#4-mudar-algo-do-dia-que-já-está-no-ar)
5. [Rotina para deixar o dia de amanhã pronto](#5-rotina-para-deixar-amanhã-pronto)
6. [Cola rápida: qual arquivo mexe em quê](#6-cola-rápida)

---

## Regra de ouro

**Nunca edite à mão `jogar.html`, `jogo/dados.js`, `DIAS.md` nem nada em `dados/pesos/`.** Eles são gerados.
Você mexe nos arquivos de `dados/` (listas, simulação, ajustes, frases, ordem) e roda um script, que refaz o resto.

O fluxo de qualquer mudança é sempre o mesmo:

```bash
git pull                                  # 1. pega a versão mais nova
# 2. edita os arquivos de dados/
python3 scripts/fama.py <categoria>       # 3. recalcula (gera jogar.html, dados.js, DIAS.md)
python3 scripts/fama.py --conferir        # 4. trava: tem que terminar sem "FALTA"
git add -A && git commit -m "o que mudou" && git push   # 5. publica
```

Quando o `main` do GitHub muda, o Cloudflare Pages publica o site sozinho em 1 ou 2 minutos
(dá para acompanhar em Cloudflare, **Workers & Pages → nichoojogo → Deployments**).

---

## 0. Preparar o computador (uma vez só)

Você precisa de **git** e **Python 3** (sem nenhuma biblioteca extra).

**Opção A, no seu computador:**

```bash
git clone https://github.com/pedro1ace/nichoojogo
cd nichoojogo
./scripts/baixar_dados.sh      # baixa a base de palavras (13 MB, fica fora do git)
python3 scripts/fama.py --conferir
```

No Windows, rode o `baixar_dados.sh` pelo Git Bash, ou faça na mão:
`git clone --depth 1 https://github.com/fserb/pt-br dados/brutos/pt-br`.

**Opção B, sem instalar nada:** no GitHub, abra o repositório, clique em **Code → Codespaces → Create codespace on main**.
Abre um VS Code no navegador com terminal, git e Python prontos. Rode o `./scripts/baixar_dados.sh` lá e siga o resto
do tutorial no terminal de baixo.

Se o último comando mostrar `0 problemas` (ou só `AVISO`), está tudo pronto.

### Como saber qual é o dia de hoje

- O **dia #1 foi 28/10/2026**. O dia #N usa as categorias da posição `(N-1)*7+1` até `N*7` de `dados/ordem.txt`
  (contando só as linhas que não começam com `#` nem `-`).
- Não precisa contar: abra **[`DIAS.md`](../DIAS.md)**, que lista cada dia com data, as 7 perguntas e quantas respostas
  cada uma tem.
- O dia vira à **meia-noite do relógio de cada jogador**.

### Como achar o id de uma categoria

O id é o nome do arquivo sem `.txt`: `dados/categorias/frutas.txt` → `frutas`. Ele aparece em todo lugar
(`dados/ordem.txt`, `dados/ajustes/frutas.csv`, `dados/sinais/lembranca/frutas.txt`...).

---

## 1. Mudar a singularidade ou a raridade de uma palavra

### 1a. Mudar a singularidade (a resposta secreta que vale 100)

No código ela se chama **supernova**.

1. Veja qual é a de hoje: abra `dados/pesos/<categoria>.json` e procure `"supernova":` (fica perto do começo).
   Ou rode:
   ```bash
   python3 -c "import json;print(json.load(open('dados/pesos/frutas.json'))['supernova'])"
   ```
2. Abra `dados/ajustes/<categoria>.csv` (se não existir, crie com a primeira linha `resposta,peso,supernova`).
3. Ache a linha da resposta nova e ponha `1` na última coluna. Se ela não tiver linha, crie uma no fim:
   ```csv
   resposta,peso,supernova
   Jabuticaba,,1
   ```
   O nome tem que ser **igual ao primeiro nome da linha** em `dados/categorias/<categoria>.txt` (acento não importa).
4. Se alguma outra linha já tinha `1`, apague esse `1` (com duas marcadas, vale a que vem primeiro na lista).
5. Rode `python3 scripts/fama.py <categoria>` e confira de novo o `"supernova"` do passo 1.

Regras que o script segue sozinho: a singularidade sempre vale 50, que o jogo dobra para **100**. Sem marcação manual,
ele escolhe uma rara que muita gente reconheceria. Um espertalhão (`@`) nunca vira singularidade.

### 1b. Mudar a raridade (os pontos) de uma palavra

Todas as categorias que ainda vão ao ar usam a **simulação de 1000 jogadores**. Os pontos saem de um número só:
**quantos jogadores, em 1000, dariam essa resposta**. Esse número fica em `dados/sinais/lembranca/<categoria>.txt`:

```
# pergunta: Cite uma fruta
Banana 160
Kiwi 15
Jabuticaba 8
Pitaya 4
```

Para mudar a raridade, **mude o número** (ou apague a linha) e rode `python3 scripts/fama.py <categoria>`.

| Quero que a palavra fique... | Faça isto | Pontos |
|---|---|---|
| **Óbvia** (branca) | número 15 ou mais | 8 a 15 |
| **Letrado** (verde) | número entre 4 e 15 | 18 a 34 |
| **Raro** (azul) | número entre 1 e 4 | 35 a 58 |
| **Espaço profundo** (roxa) | apague a linha, ou ponha menos que 1 (ex.: `0.5`) | 60 a 90 |
| **Criativa** (sacada lateral) | `~ ` na frente da linha (ex.: `~ Homer Simpson 6`) | no mínimo 70 |
| **Espertalhão** (laranja) | `@ ` na frente da linha (ex.: `@ O tempo 2`) | 15 fixos |
| Não vale como resposta | `! ` na frente da linha | não entra na lista |

Exemplo testado em Frutas: `Kiwi 15` (15 pontos) virou `Kiwi 2` (46 pontos), e `Pitaya 4` (34) virou `Pitaya 0.5` (60).

Detalhes que ajudam:

- Use **ponto** para decimal (`0.5`). Vírgula também funciona, mas ponto é mais seguro.
- Uma palavra que **não está** na simulação é sempre rara. Entre as raras, quem é mais conhecido (pelos sinais antigos:
  visitas na Wikipédia, frequência em textos) fica perto de 60, e o mais obscuro perto de 90. Com `0.5`, ela fica
  no começo das raras (perto de 60).
- O número tem que ser de uma resposta da lista. Se o jogador escreveria diferente do nome da lista, use
  `O que ele digita = Nome na lista 3` (ex.: `Batata inglesa = Batata 3`).
- **Não use** a coluna `peso` de `dados/ajustes/` para isso: nas categorias com simulação ela é ignorada. Ela só vale
  nas categorias antigas, sem simulação.
- Para ver os pontos de todas as respostas depois de rodar: `dados/pesos/revisao/<categoria>.csv` (abre no Excel ou
  Google Planilhas, coluna `pontos`).

### 1c. Frase especial de uma resposta

O cartão de resultado mostra uma frase por faixa. Para uma resposta ter frase própria, ponha uma linha em
`dados/frases.txt`:

```
categoria | Resposta como na lista | frase toda em minúsculas
filmes | Lawrence da Arábia | um salve para os três fãs no mundo de lawrence da arábia!
```

Rode `python3 scripts/fama.py <categoria>`. Se o nome não bater com a lista, o script avisa
(`AVISO: ... tem frase para ..., que não está na lista`).

---

## 2. A fórmula da fama

### 2a. O que você precisa ter

Para uma categoria, três arquivos:

- `dados/categorias/<cat>.txt`: as respostas aceitas.
- `dados/sinais/lembranca/<cat>.txt`: a simulação de 1000 jogadores.
- `dados/ajustes/<cat>.csv` (opcional): só para escolher a singularidade.

### 2b. Gerar a simulação sem o Claude Code

**Jeito 1, com chave da API** (`ANTHROPIC_API_KEY` no terminal e `pip install anthropic`):

```bash
python3 scripts/fama.py --simular minha-categoria
```

**Jeito 2, de graça, em qualquer chat de IA** (claude.ai, ChatGPT...): cole o pedido abaixo trocando a pergunta.
É o mesmo texto que o script usa.

> Você calibra um jogo diário brasileiro de palavras. Cada rodada tem uma pergunta; o jogador tem 25 segundos para
> digitar UMA resposta, e quanto menos gente der a mesma resposta, mais pontos ganha. O público é todo brasileiro que
> joga no celular: de 12 a 70 anos, de todas as regiões, com gostos variados (futebol, novela, games, cozinha,
> ciência, música). Quase ninguém é especialista.
>
> Pergunta: "**Cite uma fruta**"
>
> Simule 1000 desses jogadores respondendo, cada um com o que vem à cabeça primeiro, e conte. Liste toda resposta que
> pelo menos 0,3 de 1000 daria, da mais dita para a menos dita, uma por linha, no formato "Resposta contagem" (ex.:
> "Alface 140"). A soma deve dar 1000 menos a cauda (respostas que só uma pessoa em mil daria, que você não lista).
> Conte apelidos e grafias da mesma coisa juntos. Respostas que muita gente dá mas estão erradas para a pergunta vão
> com "! " na frente. Respostas criativas, que respondem por uma associação lateral e não por ser um exemplo literal
> (Homer Simpson para "algo amarelo", panela para "instrumento musical"), vão com "~ " na frente. Pense em coisas
> atuais também (elencos, lançamentos, gente famosa de 2026). Só as linhas, sem comentário.

Salve a resposta em `dados/sinais/lembranca/<cat>.txt` com este cabeçalho em cima:

```
# pergunta: Cite uma fruta
# feito_por: ChatGPT, simulação de 1000 jogadores
# data: 2026-11-01
Banana 160
Maçã 150
...
```

**A linha `# pergunta:` tem que ser idêntica** à `# pergunta:` de `dados/categorias/<cat>.txt`, letra por letra.
Se você mudar a pergunta depois, refaça a simulação (o `--conferir` trava se não bater).

Dê uma olhada antes de usar: a IA às vezes exagera um número ou esquece respostas óbvias. Corrigir à mão é normal.
Os espertalhões (`@`) a IA não marca: você põe à mão.

### 2c. Rodar

```bash
python3 scripts/fama.py minha-categoria --completar
```

O `--completar` faz duas coisas na lista `dados/categorias/<cat>.txt`:

- põe no fim o que a simulação disse e a lista não tinha (com um comentário `# entraram pela simulação...`);
- junta respostas repetidas (`Coalho` e `Queijo de coalho` viram uma linha só, com a outra como apelido).

Confira o que ele fez com `git diff dados/categorias/`. Às vezes um apelido errado junta duas coisas diferentes
(América Mineiro e América de Natal). Se aconteceu, desfaça a linha à mão e rode de novo **sem** `--completar`.

### 2d. A conta, passo a passo (para entender os números)

1. **Contagem**: cada linha da simulação é casada com a lista (sem acento, sem artigo, singular, apelidos). As
   linhas `!` são ignoradas. Linhas que caem na mesma resposta somam.
2. **Cauda mínima**: se a soma da simulação passar de 960, todas as contagens encolhem na mesma proporção até 960.
   Os 40 (ou mais) que sobram são a **cauda**: gente que deu respostas que só uma pessoa daria.
3. **Criativa** (`~`): a contagem dela vira no máximo 0,5 (sempre rara).
4. **Quem ficou fora da simulação** divide a cauda, em ordem de fama antiga (visitas na Wikipédia, frequência em
   textos, estimativa velha), cada um com `cauda ÷ H ÷ (posição + 10)`, onde `H` é a soma de `1/(i+10)` para todas
   as posições. Ninguém da cauda passa de 0,9 em 1000, então todos são raros.
5. **Régua fixa** (em `scripts/pontuar.py`, `REGUA_FIXA`), com `L` = quantos em 1000:

   | Faixa | L | Pontos |
   |---|---|---|
   | Óbvia | 15 ou mais (150 ou mais conta como 150) | de 8 (L=150) a 15 (L=15) |
   | Letrado | de 4 a 15 | de 18 (L=15) a 34 (L=4) |
   | Raro | de 1 a 4 | de 35 (L=4) a 58 (L=1) |
   | Espaço profundo | menos de 1 | de 60 a 90, espalhados pela ordem |

   Dentro de cada faixa, a conta é em escala log:
   `pontos = p_de + (p_até − p_de) × (ln(L) − ln(de)) ÷ (ln(até) − ln(de))`.
   Exemplo: Jabuticaba com L = 8 está entre 15 e 4: `18 + 16 × (ln 8 − ln 15) ÷ (ln 4 − ln 15) ≈ 26 pontos`.
   Nas raras, a primeira (a mais conhecida) vale 60, a última 90, e as do meio sobem por igual.
6. **Ajustes finais**: criativa vale no mínimo 70; espertalhão vale 15 fixo; a singularidade vale 50 (o jogo dobra
   para 100).
7. **"Mais nichada que X% dos jogadores"** (diário de bordo): a parte dos 1000 que daria uma resposta mais óbvia que
   esta.

Os números moram no código, se um dia quiser mudar a régua:

| O quê | Onde |
|---|---|
| Faixas e pontos (15/4/1 em 1000, 8–15, 18–34, 35–58, 60–90) | `REGUA_FIXA` e `RARA` em `scripts/pontuar.py` |
| Criativa 70, espertalhão 15, singularidade 50 | `PONTOS_CRIATIVA`, `PONTOS_ESPERTALHAO`, `SUPERNOVA_PONTOS` em `scripts/pontuar.py` |
| Cauda mínima de 40, teto da cauda 0,9, teto da criativa 0,5 | `MIN_CAUDA`, `TETO_CAUDA`, `TETO_CRIATIVA` em `scripts/fama.py` |
| Cortes de cor no jogo (18, 35, 60) | `FAIXAS` em `jogo/cena.js` |

Se mudar algum desses, rode `python3 scripts/fama.py` (sem categoria) para refazer todas.

---

## 3. Adicionar uma categoria nova

1. **Crie a lista** `dados/categorias/minha-categoria.txt` (id em minúsculas, sem acento, com hífen):
   ```
   # titulo: Frutas
   # pergunta: Cite uma fruta
   # formato: uma resposta por linha; apelidos separados por " | "
   Banana | banana-prata | banana-nanica
   Maçã | maçã verde
   Abacaxi | ananás
   ...
   ```
   - Uma resposta por linha. O **primeiro nome** é o que aparece no jogo; os outros, depois de ` | `, são apelidos e
     grafias que o jogo também aceita.
   - Acento, maiúscula, hífen e artigo não importam no casamento ("abacaxi", "o Abacaxi" e "ABACAXI" valem).
   - **Categoria aberta precisa de pelo menos 1000 respostas.** Se for fechada (o mundo só tem aquele tanto, como
     ossos ou constelações), ponha o id em `FECHADAS`, no `scripts/montar_jogo.py`.
   - Fechada com menos de 30 respostas não dá para espalhar pelas faixas: não use, ou ponha em
     `dados/fora_do_jogo.txt`.
   - **Para todas as idades**: nada de sexo, drogas, bebedeira, cigarro ou palavrão. Bebida alcoólica pode; bebedeira não.
2. **Simulação**: siga a [seção 2b](#2b-gerar-a-simulação-sem-o-claude-code) e salve em
   `dados/sinais/lembranca/minha-categoria.txt`.
3. **Rode**:
   ```bash
   python3 scripts/fama.py minha-categoria --completar
   ```
   Isso completa a lista, pontua, e põe a categoria **no fim da fila** em `dados/ordem.txt` (o script avisa:
   `dados/ordem.txt: 1 categorias novas no fim da fila`). `DIAS.md` mostra em que dia ela cai.
4. **Revise** `dados/pesos/revisao/minha-categoria.csv` (coluna `pontos`). Algo estranho? Corrija o número na
   simulação ([seção 1b](#1b-mudar-a-raridade-os-pontos-de-uma-palavra)) e rode de novo, sem `--completar`.
5. (Opcional) Escolha a singularidade ([seção 1a](#1a-mudar-a-singularidade-a-resposta-secreta-que-vale-100)).
6. **Confira e publique**:
   ```bash
   python3 scripts/fama.py --conferir
   git add -A && git commit -m "Categoria nova: Frutas" && git push
   ```

Para testar no navegador antes de publicar: abra `jogar.html?aleatorio` (sorteia categorias a cada vez e não salva
nada). O jeito mais certo de ver a sua é colocá-la no dia de hoje numa cópia local, mas normalmente olhar o CSV basta.

### Adiantar uma categoria nova na fila

A categoria nova vai para o fim. Para ela sair antes, **troque de lugar** com outra num dia **que ainda não chegou**,
em `dados/ordem.txt` (mova a linha). Nunca mexa nas linhas de dias que já passaram, nem apague linhas: isso empurra
todos os dias seguintes. Para tirar uma categoria do jogo de vez, troque a linha `minha-categoria` por
`- minha-categoria`... mas cuidado, isso também puxa as seguintes um lugar para cima. O mais seguro é **trocar de
lugar**, nunca tirar.

Depois rode `python3 scripts/montar_jogo.py` (ou o `fama.py`) e confira em `DIAS.md`.

---

## 4. Mudar algo do dia que já está no ar

Funciona igual a qualquer mudança: edita, roda o `fama.py`, confere, faz push. Em 1 ou 2 minutos o site muda.

O que muda para os jogadores:

- **Quem já jogou hoje** não vê diferença: o resultado fica salvo no navegador dele.
- **Quem joga depois** já pega a versão nova.

O que é seguro e o que evitar no dia que está no ar:

| Mudança | No dia de hoje |
|---|---|
| Aceitar uma palavra que foi recusada (apelido ou resposta nova) | Seguro. É o uso mais comum |
| Frase especial (`dados/frases.txt`) | Seguro |
| Mudar pontos ou a singularidade | Pode, mas quem já jogou ficou com os pontos antigos, e a comparação entre amigos fica injusta. Melhor só se algo estiver muito errado |
| Trocar uma categoria do dia em `dados/ordem.txt` | **Evite**. Quem já jogou fica com outras perguntas salvas, e mexer na ordem pode bagunçar os outros dias |
| Mudar a pergunta (`# pergunta:`) | Evite. Exige refazer a simulação |

### Aceitar palavras que os jogadores digitaram e foram recusadas

1. Puxe as recusadas do dia (o script lê o site, precisa de internet):
   ```bash
   python3 scripts/recusadas.py              # hoje
   python3 scripts/recusadas.py 2026-10-31   # outro dia
   ```
   Ele grava `dados/sinais/revisao/recusadas-<dia>.csv`, com a categoria, o que foi digitado (`texto`), quantas
   vezes (`n`), como ele achou algo parecido (`como`) e a resposta mais parecida da lista (`na_lista`).
2. Para cada uma que **deveria valer**:
   - se é outro nome de algo da lista, ponha como **apelido** na linha dela:
     `Tangerina | mexerica | bergamota | poncã`;
   - se é uma resposta nova, ponha uma **linha nova** no fim de `dados/categorias/<cat>.txt`. Ela entra como rara
     (fora da simulação). Se ela é comum, ponha também uma linha com o número na simulação.
3. Rode `python3 scripts/fama.py <cat>` (sem `--completar`), confira e faça push.

Quando você **só põe apelido**, os pontos não mudam: é a mudança mais segura do dia. Uma resposta nova mexe um
pouquinho nos pontos das outras raras (a faixa de 60 a 90 se espalha por mais uma).

---

## 5. Rotina para deixar amanhã pronto

Faça um dia antes (ou com alguns dias de folga):

1. `git pull`
2. Abra `DIAS.md` e veja as 7 categorias de amanhã e dos próximos dias. A fila está curta? O `montar_jogo.py` avisa
   até que dia ela dá (`dá até o dia #N`). Cada dia novo pede **7 categorias novas**: crie pela [seção 3](#3-adicionar-uma-categoria-nova).
3. Rode a trava:
   ```bash
   python3 scripts/fama.py --conferir
   ```
   Cada `FALTA:` precisa ser resolvido. Os mais comuns:

   | Mensagem | O que fazer |
   |---|---|
   | `sem simulação de jogadores` | Faça a simulação ([2b](#2b-gerar-a-simulação-sem-o-claude-code)) |
   | `a pergunta mudou depois da simulação` | Iguale a linha `# pergunta:` dos dois arquivos, ou refaça a simulação |
   | `N respostas da simulação faltam na lista` | `python3 scripts/fama.py <cat> --completar` |
   | `N respostas repetidas na lista` | Veja os pares listados. Se são mesmo a mesma coisa: `python3 scripts/fama.py <cat> --completar`. Se não são (dois times diferentes), tire o apelido que liga os dois |
   | `a fama está velha (a lista mudou)` | `python3 scripts/fama.py <cat>` |

   `AVISO:` (sem `FALTA`) não trava: é de dias mais longe, mas vale resolver antes de chegarem.
4. Olhe `dados/pesos/revisao/<cat>.csv` das categorias de amanhã: as óbvias fazem sentido? Algo absurdo valendo 90?
   Corrija na simulação ([1b](#1b-mudar-a-raridade-os-pontos-de-uma-palavra)).
5. Escolha a singularidade de cada uma, se quiser ([1a](#1a-mudar-a-singularidade-a-resposta-secreta-que-vale-100)).
6. Rode `python3 scripts/fama.py --conferir` de novo até dar `0 problemas`.
7. `git add -A && git commit -m "Dia N pronto" && git push`.

Depois que amanhã virar hoje, só aceite recusadas e frases ([seção 4](#4-mudar-algo-do-dia-que-já-está-no-ar)).

---

## 6. Cola rápida

| Quero... | Arquivo | Depois rode |
|---|---|---|
| Mudar os pontos de uma resposta | `dados/sinais/lembranca/<cat>.txt` (o número) | `fama.py <cat>` |
| Mudar a singularidade | `dados/ajustes/<cat>.csv` (coluna `supernova` = 1) | `fama.py <cat>` |
| Aceitar outra grafia | `dados/categorias/<cat>.txt` (` \| apelido` na linha) | `fama.py <cat>` |
| Aceitar resposta nova | `dados/categorias/<cat>.txt` (linha nova) | `fama.py <cat>` |
| Marcar criativa / espertalhão / inválida | `~ ` / `@ ` / `! ` na simulação | `fama.py <cat>` |
| Frase especial | `dados/frases.txt` | `fama.py <cat>` |
| Categoria nova | `dados/categorias/` + `dados/sinais/lembranca/` | `fama.py <cat> --completar` |
| Mudar a ordem dos dias futuros | `dados/ordem.txt` (trocar linhas de lugar) | `montar_jogo.py` |
| Tirar uma categoria do jogo | `dados/fora_do_jogo.txt` (cuidado: puxa os dias seguintes, ver seção 3) | `pontuar.py` |
| Ver os dias | `DIAS.md` | (gerado) |
| Ver pontos de tudo | `dados/pesos/revisao/<cat>.csv` | (gerado) |

`fama.py` = `python3 scripts/fama.py`. Antes de publicar, sempre `python3 scripts/fama.py --conferir`.

### Se algo der errado

- **Publicou e quebrou?** Volte o último commit: `git revert HEAD && git push`. Em 2 minutos o site volta.
- **`Base não encontrada`**: rode `./scripts/baixar_dados.sh`.
- **`linha sem contagem`**: alguma linha da simulação está sem número no fim.
- **`git push` recusado**: alguém mudou antes; rode `git pull`, depois o `fama.py` de novo, e faça push.
- **Mudou e nada aconteceu no jogo**: confira se rodou o `fama.py` (ele que refaz o `jogar.html`) e se o push foi.
  Recarregue a página com Ctrl+Shift+R.
