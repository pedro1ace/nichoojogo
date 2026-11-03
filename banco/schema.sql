-- Banco D1 da curva de pontuação (functions/api/pontuacao.js).
-- Uma linha por dia e faixa de 10 pontos, com quantas viagens terminaram ali.
-- Nada que identifique quem jogou.
CREATE TABLE IF NOT EXISTS histograma (
  dia   TEXT    NOT NULL,  -- AAAA-MM-DD, o dia do jogo
  faixa INTEGER NOT NULL,  -- pontos / 10, arredondado para baixo
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, faixa)
);

-- Contagem das respostas de cada dia (functions/api/respostas.js): é a fama de verdade.
-- Só o dia, a categoria e a resposta. Nada que identifique quem jogou.
CREATE TABLE IF NOT EXISTS respostas (
  dia       TEXT    NOT NULL,  -- AAAA-MM-DD
  categoria TEXT    NOT NULL,  -- id da categoria (dados/categorias/<id>.txt)
  resposta  TEXT    NOT NULL,  -- o nome da resposta na lista
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, categoria, resposta)
);

-- O que os jogadores digitaram e a lista não aceitou, normalizado. Vira candidata na fila (scripts/fila.py).
CREATE TABLE IF NOT EXISTS recusadas (
  dia       TEXT    NOT NULL,
  categoria TEXT    NOT NULL,
  texto     TEXT    NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, categoria, texto)
);

-- Pacote das 7 perguntas de cada dia (functions/api/dia.js).
-- Guarda o payload JSON enxuto de cada dia (~150 KB compactado) para que o jogador
-- baixe apenas o dia atual em vez dos 9.7 MB do jogo todo.
CREATE TABLE IF NOT EXISTS dias (
  dia        TEXT NOT NULL PRIMARY KEY, -- AAAA-MM-DD
  payload    TEXT NOT NULL,             -- JSON com as 7 categorias do dia
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
