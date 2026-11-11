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
  pontos    INTEGER,  -- pontos na hora, pela fama que a IA estimou (no máximo o topo do Raro)
  modelo    TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (categoria, texto)
);

-- Quantas vezes a IA foi chamada em cada dia (UTC, que é quando o limite grátis da Cloudflare zera).
CREATE TABLE IF NOT EXISTS juiz_uso (
  dia TEXT    NOT NULL PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);

-- Contador aproximado (por amostra) das linhas que /api/respostas gravou no dia UTC. Passando do teto,
-- as contagens param e o resto da cota grátis do D1 fica para a curva (functions/api/respostas.js).
CREATE TABLE IF NOT EXISTS cota (
  dia TEXT    NOT NULL PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);

-- Limpeza dos testes do juiz (04/11, pedido do pedrinho): a tabela "juizo" era da primeira versão
-- e não é mais usada; os vereditos gravados antes do juiz entrar no ar (20:41 UTC) vieram dos testes
-- na prévia. As duas linhas não fazem nada nas próximas cargas.
DROP TABLE IF EXISTS juizo;
DELETE FROM vereditos WHERE criado_em < '2026-11-04 20:41:00';

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

-- Conta opcional com Google, progresso salvo e placar diário (servidor/conta.js, docs/CONTA.md).
-- Do Google fica só o resumo SHA-256 do identificador da conta ("google"): nada de nome, e-mail ou foto.
-- O mesmo SQL está em servidor/conta.js (SQL_TABELAS), para a prévia do PR funcionar antes da carga.
CREATE TABLE IF NOT EXISTS contas (
  id                TEXT PRIMARY KEY,           -- aleatório, é o que aparece no placar para denunciar
  google            TEXT NOT NULL UNIQUE,       -- SHA-256 de "google:<sub>"
  apelido           TEXT NOT NULL,
  apelido_chave     TEXT NOT NULL UNIQUE,       -- sem acento, minúsculo, só letras e números
  apelido_escolhido INTEGER NOT NULL DEFAULT 0, -- 0 = ainda é o automático (Viajante-0000)
  dev               INTEGER NOT NULL DEFAULT 0, -- 1 = equipe (selo DEV amarelo), decidido no login pelo e-mail do token
  trocas_dia        TEXT,                       -- limite de trocas de apelido por dia
  trocas_n          INTEGER NOT NULL DEFAULT 0,
  criada_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Sessões: o cookie leva um código aleatório; aqui fica só o SHA-256 dele.
CREATE TABLE IF NOT EXISTS sessoes (
  token     TEXT PRIMARY KEY,
  conta     TEXT NOT NULL,
  expira_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_conta ON sessoes (conta);
-- O registro de cada dia, igual ao nicho:v7:<dia> do navegador. A 1ª viagem completa nunca é sobrescrita.
CREATE TABLE IF NOT EXISTS progresso (
  conta         TEXT NOT NULL,
  dia           TEXT NOT NULL,
  dados         TEXT NOT NULL,              -- JSON {historico, total, inicio, fim, noDia}
  completa      INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conta, dia)
);
-- Placar diário. Chave (conta, dia): só a 1ª viagem de cada conta em cada dia (ON CONFLICT DO NOTHING).
-- Só entra a viagem completa que chegou NO PRÓPRIO DIA pelo relógio do servidor (Brasília), com os
-- pontos conferidos pelo servidor contra a lista do dia. Depois das 23:59 o placar do dia fecha.
CREATE TABLE IF NOT EXISTS viagens (
  conta     TEXT    NOT NULL,
  dia       TEXT    NOT NULL,
  pontos    INTEGER NOT NULL,
  no_dia    INTEGER NOT NULL,  -- 1 = terminou no próprio dia (hoje sempre 1: as outras não entram)
  criada_em TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conta, dia)
);
CREATE INDEX IF NOT EXISTS placar ON viagens (dia, no_dia, pontos DESC);
-- Denúncias de apelido. Com 3 contas diferentes, o apelido sai do ar e vai para apelidos_barrados.
CREATE TABLE IF NOT EXISTS denuncias (
  alvo      TEXT NOT NULL,
  autor     TEXT NOT NULL,
  apelido   TEXT NOT NULL,  -- apelido_chave do alvo na hora da denúncia
  dia       TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (alvo, autor, apelido)
);
CREATE INDEX IF NOT EXISTS denuncias_autor ON denuncias (autor, dia);
-- Apelidos que ninguém pode usar: barrados pela IA, por denúncia ou à mão (origem = 'manual').
CREATE TABLE IF NOT EXISTS apelidos_barrados (
  chave     TEXT PRIMARY KEY,
  origem    TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
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
