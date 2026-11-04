// Pacote das 7 categorias do dia (Cloudflare Pages Function, em /api/dia).
//
// Retorna apenas as perguntas e respostas do dia solicitado, reduzindo o download
// inicial do jogo de ~9.7 MB para ~150 KB.
//
//   GET /api/dia?dia=2026-11-03   devolve as 7 categorias daquele dia
//
// Usa o binding D1 (DB), tabela 'dias' (ver banco/schema.sql).
// O cache na CDN (Cloudflare edge) é de 1 hora para respostas válidas.

const json = (corpo, status = 200, maxAge = 3600) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : "no-store",
    },
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

function diaValido(dia) {
  return typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const dia = url.searchParams.get("dia") || hojeBrasil();

  if (!diaValido(dia)) {
    return json({ erro: "formato de dia inválido (use AAAA-MM-DD)" }, 400, 0);
  }

  if (!env.DB) {
    return json({ erro: "banco D1 não configurado" }, 500, 0);
  }

  try {
    const row = await env.DB.prepare("SELECT payload FROM dias WHERE dia = ?").bind(dia).first();
    if (!row || !row.payload) {
      return json({ erro: "dia não encontrado no banco", dia }, 404, 0);
    }
    // row.payload já é uma string JSON gerada pelo scripts/sincronizar_d1.py
    return new Response(row.payload, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (err) {
    return json({ erro: "falha ao consultar banco", detalhe: String(err) }, 500, 0);
  }
}
