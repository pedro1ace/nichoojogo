// Pacote das 7 categorias do dia (Cloudflare Pages Function, em /api/dia).
//
// Retorna apenas as perguntas e respostas do dia solicitado, reduzindo o download
// inicial do jogo de ~9.7 MB para ~150 KB.
//
//   GET /api/dia?dia=2026-11-03   devolve as 7 categorias daquele dia
//
// Usa o binding D1 (DB), tabela 'dias' (ver banco/schema.sql).
// Cache: o pacote de cada dia fica no cache da Cloudflare (Cache API), para o banco não ler o
// payload grande a cada jogador. A chave do cache leva a hora da última carga daquele dia
// (dias.criado_em, que a carga_dias.sql atualiza): cada carga nova cai numa chave nova e aparece
// na hora. Antes a chave era só o dia, e um pacote velho ficou preso no cache por horas depois
// das cargas de 04-05/11 (as singularidades novas do Dia 9 não apareciam no jogo).
// (O cache só funciona no domínio próprio, nichoojogo.com; nas prévias *.pages.dev ele é ignorado.)

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

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const dia = url.searchParams.get("dia") || hojeBrasil();

  if (!diaValido(dia)) {
    return json({ erro: "formato de dia inválido (use AAAA-MM-DD)" }, 400, 0);
  }

  if (!env.DB) {
    return json({ erro: "banco D1 não configurado" }, 500, 0);
  }

  try {
    // leitura leve: só a hora da última carga do dia, para montar a chave do cache
    const versao = await env.DB.prepare("SELECT criado_em FROM dias WHERE dia = ?").bind(dia).first();
    if (!versao) {
      return json({ erro: "dia não encontrado no banco", dia }, 404, 0);
    }
    const chave = new Request(`${url.origin}/api/dia?dia=${dia}&v=${encodeURIComponent(versao.criado_em || "")}`);
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache) {
      try {
        const guardado = await cache.match(chave);
        if (guardado) return guardado;
      } catch {}
    }

    const row = await env.DB.prepare("SELECT payload FROM dias WHERE dia = ?").bind(dia).first();
    if (!row || !row.payload) {
      return json({ erro: "dia não encontrado no banco", dia }, 404, 0);
    }
    // row.payload já é uma string JSON gerada pelo scripts/sincronizar_d1.py
    // navegador guarda 5 minutos; o cache da Cloudflare (chave com a versão) guarda 1 hora
    const resposta = new Response(row.payload, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=3600",
      },
    });
    if (cache) {
      const guardar = cache.put(chave, resposta.clone()).catch(() => {});
      if (typeof waitUntil === "function") waitUntil(guardar);
    }
    return resposta;
  } catch (err) {
    return json({ erro: "falha ao consultar banco", detalhe: String(err) }, 500, 0);
  }
}
