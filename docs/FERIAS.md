# Pacote de férias (07/11/2026)

89 categorias novas, todas com lista, simulação de 1000 jogadores, singularidade escolhida à mão e
descrição. Com elas a fila vai até o **Dia 26 (dom 22/11/2026)**. `python3 scripts/fama.py --conferir`
termina com `0 problemas`.

## O que fazer antes de sair (uma vez)

1. Mesclar o PR no `main` (o Cloudflare publica sozinho em 1 ou 2 minutos).
2. Mandar os dias novos para o D1:
   ```bash
   git pull
   npx wrangler d1 execute DB --remote --file=banco/carga_dias.sql
   ```
   Se der erro dizendo que não acha "DB", use o nome que aparece em `npx wrangler d1 list`.
   Sem esse passo o jogo ainda funciona (cai para `jogo/dados.js`), mas fica mais pesado para carregar.

Pronto. Daqui até 22/11 não precisa rodar mais nada.

## Durante as férias (opcional)

- O **Plantão Diário** continua abrindo um PR por dia às 20h com as recusadas viradas em apelido.
  Se ninguém mesclar, nada quebra: só deixam de entrar os apelidos novos. Se der para mesclar pelo
  celular, mescle e (quando puder) rode o comando do D1 de novo.
- Os dias 14 a 26 já estão na `carga_dias.sql`. Mexer em categoria que já foi ao ar não é necessário.

## Quando voltar

A fila acaba em 22/11 (sobram 3 categorias para o Dia 27). Antes disso é preciso criar mais 4 para
fechar o Dia 27, e mais 7 por dia depois.

## As 89 categorias

| Grupo | Categorias |
|---|---|
| Comida (14) | tipos-de-pao, biscoitos-e-bolachas, sabores-de-sorvete, sabores-de-bolo, massas, molhos, recheios-de-pastel, comidas-de-rua, pratos-internacionais, cafe-da-manha, padaria, doces-de-mercado, supermercado, graos-e-cereais |
| Bichos e plantas (8) | mamiferos, repteis-e-anfibios, animais-da-africa, animais-da-fazenda, animais-venenosos, animais-que-botam-ovo, flores, arvores |
| Casa e objetos (11) | coisas-do-banheiro, coisas-do-quarto, moveis, ferramentas, eletronicos, coisas-da-bolsa, partes-do-carro, brinquedos, higiene-e-beleza, roupas, calcados-e-acessorios |
| "Coisas que..." (16) | coisas-verdes, coisas-vermelhas, coisas-azuis, coisas-que-fazem-barulho, coisas-quentes, coisas-geladas, coisas-fedidas, coisas-cheirosas, coisas-pontudas, coisas-com-rodas, coisas-que-derretem, coisas-que-quebram, coisas-que-grudam, coisas-que-dao-medo, coisas-que-dao-azar, coisas-que-giram |
| Vida e datas (9) | feriados-e-datas, festa-de-aniversario, carnaval, motivos-para-chorar, cursos-de-faculdade, hobbies, sentimentos, doencas, palavras-em-ingles |
| Gente (11) | nomes-masculinos, nomes-femininos, sobrenomes, atores-brasileiros, atores-de-hollywood, apresentadores-de-tv, influenciadores, atletas-brasileiros, pilotos-de-f1, cientistas-e-inventores, pintores-e-artistas |
| Cultura pop (10) | personagens-de-videogame, personagens-de-anime, personagens-do-chaves, sitio-do-picapau, monstros-e-criaturas, bandas, musicas-brasileiras, filmes-brasileiros, programas-de-tv, livros |
| Marcas e lugares (7) | apps-e-sites, marcas-famosas, lojas, fast-food, pontos-turisticos, praias-brasileiras, estadios |
| Palavras (3) | palavras-em-ao, palavras-com-z, palavras-com-x |

A ordem em `dados/ordem.txt` foi intercalada para cada dia ter temas de grupos diferentes.

## Como foram feitas

- **Listas**: escritas à mão (com apelidos e grafias) para as 86 temáticas; as 3 de palavras saem do
  léxico pt-BR (`dados/brutos/pt-br`), sem formas conjugadas nem plurais, e entre grafias que só mudam o
  acento fica a mais usada. Fora: sexo, drogas, palavrão, política partidária.
- **Simulação**: `dados/sinais/lembranca/<id>.txt`, feita pelo Claude no mesmo estilo das últimas
  (jogador estratégico, 30 a 60 s). Criativas (`~`) e inválidas (`!`) marcadas.
- **Singularidade**: escolhida à mão em `dados/ajustes/<id>.csv`, sempre algo que dá para lembrar mas
  não é o óbvio, com a curiosidade em `dados/singularidades.txt`.
- **Tamanho**: as listas têm de 30 (Chaves e Chapolin) a 6.260 (Palavras em -ão) respostas. Todas entraram
  em `FECHADAS` no `scripts/montar_jogo.py` (como no pedido de 04/11), para o aviso de "menos de 1000" não
  encher a tela. As recusadas do plantão completam o que faltar.

## Engordar as listas (opcional, precisa de internet na sua máquina)

O ambiente do Claude não acessa o Wikidata nem a Wikipédia, então isso ficou para rodar aí. O
`expandir_fontes.py` só **acrescenta** (não apaga o que já tem). Rode antes de a categoria ir ao ar:

```bash
# entidades novas a partir de categorias da Wikipédia PT (confira o nome da categoria no site)
python3 scripts/expandir_fontes.py --coletar "Filmes_do_Brasil" filmes-brasileiros
python3 scripts/expandir_fontes.py --coletar "Atores_do_Brasil" atores-brasileiros
python3 scripts/expandir_fontes.py --coletar "Atrizes_do_Brasil" atores-brasileiros
python3 scripts/expandir_fontes.py --coletar "Estádios_de_futebol_do_Brasil" estadios
python3 scripts/expandir_fontes.py --coletar "Praias_do_Brasil" praias-brasileiras
python3 scripts/expandir_fontes.py --coletar "Bandas_do_Brasil" bandas
python3 scripts/expandir_fontes.py --coletar "Programas_de_televisão_do_Brasil" programas-de-tv
python3 scripts/expandir_fontes.py --coletar "Pilotos_de_Fórmula_1_do_Brasil" pilotos-de-f1
python3 scripts/expandir_fontes.py --coletar "Pintores_do_Brasil" pintores-e-artistas

# apelidos (redirecionamentos da Wikipédia e rótulos do Wikidata); sem --aplicar só mostra
python3 scripts/expandir_fontes.py --apelidos filmes-brasileiros --aplicar

# depois de qualquer um deles
python3 scripts/fama.py <categoria>
python3 scripts/fama.py --conferir
```

As respostas que entram assim ficam como raras (fora da simulação), o que é o certo para elas.

## Engordar sem API (dumps da Wikipédia)

A API da Wikipédia e o Wikidata limitam demais para coletar milhares de respostas. O caminho que
escala usa os dumps públicos da Wikipédia PT (categorias, páginas e redirecionamentos):

```bash
python3 scripts/coletar_wikipedia.py --baixar      # baixa os dumps para dados/brutos/ptwiki (fora do git)
python3 scripts/coletar_wikipedia.py --preparar    # monta dados/brutos/ptwiki/ptwiki.db (sqlite)
python3 scripts/coletar_wikipedia.py mamiferos     # lê a receita <cat>.wiki.json e grava <cat>.wiki.txt
python3 scripts/engordar.py mamiferos              # acrescenta à lista (nunca tira nada)
python3 scripts/fama.py mamiferos                  # refaz fama e pontos
python3 scripts/fama.py --conferir
```

Tudo fica em `dados/fontes/engordar/`:

- `<cat>.wiki.json` é a receita: categorias da Wikipédia, profundidade, o que excluir.
- `<cat>.wiki.txt` é o que saiu dela.
- `<cat>.txt` é a lista escrita à mão.
- `emprestimos.json` liga uma categoria a outras cujas respostas também valem nela (por exemplo, supermercado pega frutas, queijos e as demais).

O `engordar.py` não repete respostas e não deixa um apelido ligar duas respostas. Ele também pula o que está em `dados/bloqueadas.js`.
Quando uma categoria passa de 1000 respostas, ela sai do pacote de férias em `FECHADAS` (`scripts/montar_jogo.py`).

## Coletar muita resposta de uma vez (rodar na sua máquina)

O `scripts/coletar_fontes.py` puxa do Wikidata (SPARQL), do IBGE (nomes do Censo) e do Open Library.
Não precisa de chave de API. Daqui da nuvem esses sites são bloqueados, por isso ele roda na sua máquina.

```bash
python3 scripts/coletar_fontes.py            # tudo (demora; respeita limite dos sites)
python3 scripts/coletar_fontes.py --listar   # o que ele cobre
python3 scripts/coletar_fontes.py livros bandas --fonte wikidata
python3 scripts/engordar.py && python3 scripts/fama.py && python3 scripts/fama.py --conferir
python3 scripts/montar_jogo.py && python3 scripts/sincronizar_d1.py
```

Ele grava `dados/fontes/engordar/<cat>.<fonte>.txt`. Dá commit e push desses arquivos (ou de tudo), que eu encaixo.
