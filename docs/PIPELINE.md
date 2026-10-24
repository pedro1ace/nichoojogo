# Pipeline do Nicho

Etapas em ordem. Cada uma termina em algo que dá para testar.

## Etapa 0: Repositório e dupla

- [x] Repositório criado e estrutura inicial no ar.
- [ ] Convidar o parceiro (`cincoano`) em Settings > Collaborators > Add people.
- [ ] Combinar o fluxo: cada mudança numa branch com pull request, e o outro revisa.
- [ ] Ligar o GitHub Pages (Settings > Pages > Deploy from a branch > `main`, pasta `/ (root)`) para jogar online.

## Etapa 1: Peso de nicho (básico pronto)

- [x] Baixar a base pt-BR (`scripts/baixar_dados.sh`).
- [x] Calcular o peso por pergunta a partir do ICF (`scripts/pontuar.py`).
- [x] Ajustes manuais por pergunta (`dados/ajustes/`).
- [ ] Revisar as 5 perguntas iniciais e preencher as respostas marcadas `sem_dado`.
- [ ] Fechar a fórmula: quanto pesa o percentil vs. a raridade global, e a curva dos pontos.

## Etapa 2: Banco de perguntas (o gargalo)

A sessão é remontada todo dia com perguntas inéditas. Com 7 por dia, um mês pede uns 200 conjuntos de respostas.
A base pt-BR só tem palavras e não tem categorias, então cada pergunta precisa de curadoria.
Pesquisa de fontes, sinais de raridade, LLM e apelidos: [BANCO-DE-PALAVRAS.md](BANCO-DE-PALAVRAS.md).
Seguimos o mesmo método do Krillion:

- [ ] **Juntar fontes** por pergunta: listas da base, dicionários, páginas da Wikipédia, enciclopédias.
      Mesclar e limpar num conjunto único (um script por tipo de fonte, por exemplo `scripts/importar_wikipedia.py`).
- [ ] **Apelidos**: guardar grafias e nomes alternativos (`Fobos | Phobos`). Isso evita "minha resposta não foi aceita".
- [ ] **Raridade em duas vias**:
      - mecânica, pelo ICF, quando a resposta é uma palavra comum de texto (países, animais, profissões);
      - LLM mais revisão humana quando o ICF não serve (nomes próprios, termos com duplo sentido como "Mesa").
        Pedir "de 0 a 100, quantos brasileiros conhecem isto?" e gravar em `dados/ajustes/`.
- [ ] **Fila do modo aberto**: respostas que a lista não conhecia são julgadas em lote com `scripts/fila.py`
      e as aceitas entram na lista. Falta o lugar grátis para o jogo guardar o que foi digitado (Supabase ou Cloudflare).
- [ ] **Supernova pela graça, não só pela raridade**: algo que poucos acertam, mas que alguns acertam de verdade.
- [ ] Meta: 50 perguntas revisadas antes do lançamento, depois umas 7 novas por semana.

### Categorias integradas e fontes

Categorias vindas do Wikidata têm uma receita em `dados/fontes/<id>.json` e são geradas por
`python3 scripts/importar.py <id>` (validações comuns: contagem, duplicatas, colisão de apelidos,
apelidos curtos e apelidos que são palavra comum). `--conferir` mostra se o `.txt` mudaria.

- **Elementos químicos** (`dados/categorias/elementos-quimicos.txt`):
  - **Fonte**: Wikidata SPARQL endpoint (`wd:Q11344` / chemical element, `wdt:P1086` números atômicos 1 a 118).
  - **Receita**: `dados/fontes/elementos-quimicos.json` (antes era `scripts/importar_elementos.py`).
  - **Data**: 2026-10-23.
  - **Validação**: Exatamente 118 elementos únicos, nomes preferenciais em pt-BR, com símbolos químicos IUPAC e variantes ortográficas em português registradas como apelidos.
- **Astronautas** (680), **Missões espaciais** (555), **Exoplanetas** (386) e **Luas do Sistema Solar** (300):
  - **Receitas**: `dados/fontes/<id>.json`. Todas exigem artigo na pt.wikipedia, para ficar só o que tem nome conhecido em português.
  - **Data**: 2026-10-24.
  - **Luas** troca a lista manual de 28: todas as 28 continuam, e os nomes em inglês que ela aceitava (Phobos, Titan...) estão nas `correcoes` da receita.

Visitas e sitelinks: `scripts/baixar_visitas.sh` baixa 12 meses de visitas da pt.wikipedia (dumps públicos, uns 45 min,
fora do git) e `scripts/buscar_wikidata.py` grava sitelinks e visitas por resposta em `dados/sinais/wikidata/<cat>.json`.
Categoria importada usa o Q... da própria consulta; as outras procuram pelo nome e podem errar (o script lista as dúvidas).
Quando mais da metade das respostas não está na base de palavras (nomes próprios), o `pontuar.py` ordena a categoria
pelas visitas em vez do ICF.

## Etapa 3: Jogo em pixel art (protótipo pronto)

- [x] Sessão diária com sorteio pela data, uma resposta por pergunta, 3 tentativas, supernova.
- [x] Cena 2D em pixel art: foguete, estrelas, sprite por faixa de pontos (satélite, lua, planeta, supernova).
- [x] Resultado em emoji para compartilhar, e progresso do dia salvo no navegador.
- [x] Tela cheia: o foguete parte da Terra e desce; o fundo vai do céu claro ao preto e as estrelas rareiam.
- [x] Marcos de profundidade (Lua, Marte, Júpiter... buraco negro) e objetos no caminho (satélites, asteroides, cometas).
- [x] Descida suave no mesmo tempo para toda resposta: as raras descem muito mais nesse tempo, então caem rápido.
- [x] Tremor da tela inteira proporcional à raridade, e flash na supernova.
- [x] Palavra numa caixinha que afunda junto e depois sobe para a superfície; roxa e rápida se for rara, clara e lenta se for óbvia.
- [x] Autocorreção generosa contra respostas e apelidos, ignorando acentos, artigos e espaços. Sugere e preenche, sem enviar.
- [x] Cronômetro de 25 s, cartão de resultado por resposta, mascote, sons 8-bit, diário de bordo no fim.
- [ ] **Calendário de perguntas** (`dados/calendario.json`: data → perguntas), para garantir perguntas inéditas
      e controlar a dificuldade, em vez do sorteio atual (que repete perguntas).
- [ ] Revisar a autocorreção com perguntas grandes: bloquear casamentos estranhos (o problema "sea donkey" do FAQ do Krillion).
- [ ] Mais sprites e animação: explosão da supernova, foguete trocando de fase conforme a distância, mascote reagindo à faixa.
- [ ] Comparação com os outros jogadores do dia (precisa de um servidor guardando os resultados).
- [ ] Ajustar o ritmo: distância entre marcos e cores do fundo conforme as pontuações reais dos jogadores.
- [ ] Imagem do resultado (canvas em pixel art) para compartilhar além do texto.
- [ ] Modo ilimitado e arquivo dos dias anteriores.

## Etapa 4: Lançamento

- [ ] Tirar ou esconder o botão de modo teste ("jogar de novo") antes de publicar.

- [ ] Nome e domínio definitivos.
- [ ] Teste com amigos. O que todo mundo responde é óbvio por definição, então usar essas respostas para recalibrar os pesos.
- [ ] Estatísticas anônimas das respostas (o que foi digitado e não foi aceito mostra o que falta nas listas).
- [ ] Depois: ranking entre amigos, multiplayer, pacotes temáticos.

## Divisão sugerida para a dupla

- Pessoa A: dados (Etapas 1 e 2), fontes, pesos, revisão das perguntas.
- Pessoa B: jogo (Etapa 3), sprites, animações, deploy.
