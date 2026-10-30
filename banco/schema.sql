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

-- Apoios via Pix (functions/api/apoio/).
-- Guarda só o identificador do pedido, o id do pagamento no Mercado Pago, o valor em centavos,
-- o status e o código que libera a skin de apoiador em outros aparelhos. Sem nome, CPF ou IP.
CREATE TABLE IF NOT EXISTS apoios (
  id        TEXT    PRIMARY KEY,
  mp_id     TEXT    UNIQUE,
  centavos  INTEGER NOT NULL,
  status    TEXT    NOT NULL DEFAULT 'pending',
  codigo    TEXT    NOT NULL UNIQUE,
  criado_em TEXT    NOT NULL,
  pago_em   TEXT
);
