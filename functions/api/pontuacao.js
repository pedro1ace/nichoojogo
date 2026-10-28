// Curva de pontuação do dia (Cloudflare Pages Function, em /api/pontuacao).
//
// Guarda só um histograma anônimo: para cada dia, quantas viagens terminaram
// em cada faixa de 10 pontos. Não guarda IP, nome, cookie nem as respostas.
//
//   GET  /api/pontuacao?dia=2026-10-28        devolve a curva do dia
//   POST /api/pontuacao {dia, pontos}          soma uma viagem e devolve a curva
//
// Precisa de um banco D1 ligado ao projeto com o nome DB (veja banco/schema.sql).

const LARGURA = 10; // pontos por barra do histograma
const MAXIMO = 700; // 7 perguntas x 100 (singularidade)
const ULTIMA = Math.floor(MAXIMO / LARGURA);

const resposta = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// O jogo usa a data local do jogador, então aceita de ontem a amanhã em UTC.
function diaValido(dia) {
  if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const t = Date.parse(dia + "T00:00:00Z");
  if (Number.isNaN(t)) return false;
  const hoje = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.abs(t - hoje) <= 86400000;
}

async function curva(db, dia) {
  const { results } = await db.prepare("SELECT faixa, n FROM histograma WHERE dia = ?").bind(dia).all();
  const contagem = new Array(ULTIMA + 1).fill(0);
  for (const r of results) if (r.faixa >= 0 && r.faixa <= ULTIMA) contagem[r.faixa] = r.n;
  return { dia, largura: LARGURA, contagem, total: contagem.reduce((s, n) => s + n, 0) };
}

export async function onRequestGet({ request, env }) {
  const dia = new URL(request.url).searchParams.get("dia");
  if (!diaValido(dia)) return resposta({ erro: "dia inválido" }, 400);
  return resposta(await curva(env.DB, dia));
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return resposta({ erro: "corpo inválido" }, 400);
  }
  const { dia, pontos } = corpo || {};
  if (!diaValido(dia)) return resposta({ erro: "dia inválido" }, 400);
  if (!Number.isInteger(pontos) || pontos < 0 || pontos > MAXIMO) return resposta({ erro: "pontos inválidos" }, 400);
  await env.DB.prepare(
    "INSERT INTO histograma (dia, faixa, n) VALUES (?, ?, 1) ON CONFLICT (dia, faixa) DO UPDATE SET n = n + 1",
  )
    .bind(dia, Math.floor(pontos / LARGURA))
    .run();
  return resposta(await curva(env.DB, dia));
}
