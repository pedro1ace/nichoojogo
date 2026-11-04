// Contagem das respostas do dia (Cloudflare Pages Function, em /api/respostas).
//
// Não mexe nos pontos (ainda há poucos jogadores e ficaria volátil). Serve para
// conferir, somando várias semanas, onde a simulação de jogadores (scripts/fama.py) erra.
//
// Guarda só o dia, a categoria e a resposta. Nada de IP, nome ou cookie.
// As respostas que a lista recusou também são contadas (em "recusadas"), para entrarem
// na fila de revisão (scripts/fila.py): é assim que a lista se completa sozinha.
//
//   GET  /api/respostas?dia=2026-10-30                        contagem das categorias do dia
//   GET  /api/respostas?dia=2026-10-30&recusadas=1            o que foi recusado no dia
//        (com "ia": o veredito do juiz, functions/api/juiz.js, ou null; e "ia_nome": o nome no padrão)
//   POST /api/respostas {dia, categoria, resposta}            soma uma resposta aceita
//   POST /api/respostas {dia, categoria, recusada}            soma uma resposta recusada
//
// Precisa do banco D1 da curva (DB), com as tabelas de banco/schema.sql.

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const FUSO_BRASIL = "America/Sao_Paulo";

function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// O jogo usa o horário oficial de Brasília (America/Sao_Paulo, UTC-3).
function diaValido(dia) {
  if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const t = Date.parse(dia + "T00:00:00-03:00");
  if (Number.isNaN(t)) return false;
  const hoje = Date.parse(hojeBrasil() + "T00:00:00-03:00");
  return Math.abs(t - hoje) <= 86400000;
}

const textoValido = (t, max) => typeof t === "string" && t.trim().length > 0 && t.length <= max;
const categoriaValida = (c) => typeof c === "string" && /^[a-z0-9-]{1,60}$/.test(c);

// Recusada vai normalizada (minúsculas, sem acento, espaços simples), para "Setembro" e "setembro" somarem juntas.
const normalizar = (t) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function contagem(db, dia) {
  const { results } = await db
    .prepare("SELECT categoria, resposta, n FROM respostas WHERE dia = ?")
    .bind(dia)
    .all();
  const categorias = {};
  for (const r of results) {
    const c = (categorias[r.categoria] ||= { total: 0, contagem: {} });
    c.contagem[r.resposta] = r.n;
    c.total += r.n;
  }
  return { dia, categorias };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const dia = url.searchParams.get("dia") || hojeBrasil();
  if (!diaValido(dia)) return json({ erro: "dia inválido" }, 400);
  if (url.searchParams.has("recusadas")) {
    const { results } = await env.DB.prepare(
      "SELECT r.categoria, r.texto, r.n, j.veredito AS ia, j.nome AS ia_nome FROM recusadas r " +
        "LEFT JOIN vereditos j ON j.categoria = r.categoria AND j.texto = r.texto " +
        "WHERE r.dia = ? ORDER BY r.n DESC LIMIT 2000",
    )
      .bind(dia)
      .all();
    return json({ dia, recusadas: results });
  }
  return json(await contagem(env.DB, dia));
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }
  const { dia, categoria, resposta, recusada } = corpo || {};
  if (!diaValido(dia)) return json({ erro: "dia inválido" }, 400);
  if (!categoriaValida(categoria)) return json({ erro: "categoria inválida" }, 400);
  if (textoValido(resposta, 120)) {
    await env.DB.prepare(
      "INSERT INTO respostas (dia, categoria, resposta, n) VALUES (?, ?, ?, 1) " +
        "ON CONFLICT (dia, categoria, resposta) DO UPDATE SET n = n + 1",
    )
      .bind(dia, categoria, resposta.trim())
      .run();
    return json({ ok: true });
  }
  if (textoValido(recusada, 60) && normalizar(recusada).length >= 2) {
    await env.DB.prepare(
      "INSERT INTO recusadas (dia, categoria, texto, n) VALUES (?, ?, ?, 1) " +
        "ON CONFLICT (dia, categoria, texto) DO UPDATE SET n = n + 1",
    )
      .bind(dia, categoria, normalizar(recusada))
      .run();
    return json({ ok: true });
  }
  return json({ erro: "resposta inválida" }, 400);
}
