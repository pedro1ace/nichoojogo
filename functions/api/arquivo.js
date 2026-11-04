// Lista dos dias anteriores, para a aba ARQUIVOS (Cloudflare Pages Function, em /api/arquivo).
//
// Devolve só o resumo de cada dia (data, número e os 7 temas), nunca as respostas:
// a lista lê a tabela leve "resumo_dias" e nem encosta nos payloads grandes de "dias".
// As perguntas de um dia só são baixadas quando alguém abre aquele dia (/api/dia).
//
//   GET /api/arquivo                     os 30 dias mais recentes antes de hoje
//   GET /api/arquivo?antes=2026-10-20    a página seguinte (dias antes de 20/10)
//   GET /api/arquivo?limite=10           quantos dias por página (1 a 60)
//
// Nunca lista hoje nem dias futuros. "Hoje" é o dia no horário de Brasília.
// Precisa do banco D1 (DB) com a tabela resumo_dias (banco/schema.sql, carregada pelo
// banco/carga_dias.sql). Se ela ainda não existir, cai para a tabela "dias" sem os temas.

const LANCAMENTO = "2026-10-28";
const PADRAO = 30;
const MAXIMO = 60;

const json = (corpo, status = 200, maxAge = 600) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // a lista só muda à meia-noite: 10 minutos de cache na CDN bastam
      "cache-control": maxAge > 0 ? `public, max-age=${Math.min(maxAge, 300)}, s-maxage=${maxAge}` : "no-store",
    },
  });

const ehData = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));

// Brasil não tem mais horário de verão: UTC-3 o ano todo.
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

const numeroDoDia = (dia) => Math.round((Date.parse(dia + "T00:00:00Z") - Date.parse(LANCAMENTO + "T00:00:00Z")) / 86400000) + 1;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erro: "banco D1 não configurado" }, 500, 0);
  const url = new URL(request.url);
  const hoje = hojeBrasilia();
  const pedido = url.searchParams.get("antes");
  if (pedido !== null && !ehData(pedido)) return json({ erro: "use antes=AAAA-MM-DD" }, 400, 0);
  const antes = pedido && pedido < hoje ? pedido : hoje;
  const limite = Math.min(MAXIMO, Math.max(1, Number.parseInt(url.searchParams.get("limite"), 10) || PADRAO));

  let linhas;
  try {
    ({ results: linhas } = await env.DB.prepare(
      "SELECT dia, numero, titulos FROM resumo_dias WHERE dia < ? AND dia >= ? ORDER BY dia DESC LIMIT ?",
    )
      .bind(antes, LANCAMENTO, limite + 1)
      .all());
  } catch {
    // resumo_dias ainda não foi criada: lista só as datas, direto da tabela dos dias
    try {
      ({ results: linhas } = await env.DB.prepare(
        "SELECT dia FROM dias WHERE dia < ? AND dia >= ? ORDER BY dia DESC LIMIT ?",
      )
        .bind(antes, LANCAMENTO, limite + 1)
        .all());
    } catch (err) {
      return json({ erro: "falha ao consultar banco", detalhe: String(err) }, 500, 0);
    }
  }

  const mais = linhas.length > limite;
  const dias = linhas.slice(0, limite).map((l) => {
    let titulos = [];
    try {
      titulos = l.titulos ? JSON.parse(l.titulos) : [];
    } catch {}
    return { dia: l.dia, numero: l.numero || numeroDoDia(l.dia), titulos };
  });
  return json({ hoje, dias, mais });
}
