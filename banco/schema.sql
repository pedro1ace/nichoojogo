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

-- Vereditos da IA sobre as recusadas (functions/api/juiz.js). Cada resposta é julgada uma vez só,
-- por categoria. veredito: aceita (valeu na hora), recusada ou duvida (as duas vão para a revisão).
-- nome: como a IA escreve a resposta aceita no padrão ("sao paulo fc" -> "São Paulo"), para as
-- formas diferentes da mesma resposta caírem num nome só.
CREATE TABLE IF NOT EXISTS vereditos (
  categoria TEXT NOT NULL,
  texto     TEXT NOT NULL,  -- normalizado, igual a recusadas.texto
  veredito  TEXT NOT NULL,
  nome      TEXT,
  modelo    TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (categoria, texto)
);

-- Quantas vezes a IA foi chamada em cada dia (UTC, que é quando o limite grátis da Cloudflare zera).
CREATE TABLE IF NOT EXISTS juiz_uso (
  dia TEXT    NOT NULL PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);

-- Pacote das 7 perguntas de cada dia (functions/api/dia.js).
-- Guarda o payload JSON enxuto de cada dia (~150 KB compactado) para que o jogador
-- baixe apenas o dia atual em vez dos 9.7 MB do jogo todo.
CREATE TABLE IF NOT EXISTS dias (
  dia        TEXT NOT NULL PRIMARY KEY, -- AAAA-MM-DD
  payload    TEXT NOT NULL,             -- JSON com as 7 categorias do dia
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Resumo de cada dia para a aba ARQUIVOS (functions/api/arquivo.js): só a data, o número e os 7 temas.
-- Fica separado de "dias" para a lista dos dias anteriores nunca abrir os pacotes grandes,
-- por mais dias que o jogo acumule. Carregada junto com os dias (banco/carga_dias.sql).
CREATE TABLE IF NOT EXISTS resumo_dias (
  dia     TEXT    NOT NULL PRIMARY KEY, -- AAAA-MM-DD
  numero  INTEGER NOT NULL,             -- DIA #1, #2...
  titulos TEXT    NOT NULL              -- JSON: ["Aves", "Rios", ...]
);

-- FUTURO (ainda não criar): placar diário com conta logada. Plano em docs/ARQUIVOS.md.
-- A chave (conta, dia) guarda só a 1ª viagem de cada conta em cada dia (INSERT ... ON CONFLICT DO NOTHING),
-- e no_dia é decidido pelo relógio do servidor. O placar de um dia lista só no_dia = 1.
-- CREATE TABLE IF NOT EXISTS viagens (
--   conta     TEXT    NOT NULL,
--   dia       TEXT    NOT NULL,
--   pontos    INTEGER NOT NULL,
--   no_dia    INTEGER NOT NULL,  -- 1 = terminou no próprio dia; 0 = pelo arquivo
--   criada_em TEXT    NOT NULL DEFAULT (datetime('now')),
--   PRIMARY KEY (conta, dia)
-- );
-- CREATE INDEX IF NOT EXISTS placar ON viagens (dia, no_dia, pontos DESC);
