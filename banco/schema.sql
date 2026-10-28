-- Banco D1 da curva de pontuação (functions/api/pontuacao.js).
-- Uma linha por dia e faixa de 10 pontos, com quantas viagens terminaram ali.
-- Nada que identifique quem jogou.
CREATE TABLE IF NOT EXISTS histograma (
  dia   TEXT    NOT NULL,  -- AAAA-MM-DD, o dia do jogo
  faixa INTEGER NOT NULL,  -- pontos / 10, arredondado para baixo
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, faixa)
);
