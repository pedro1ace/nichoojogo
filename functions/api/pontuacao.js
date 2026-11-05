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

const FUSO_BRASIL = "America/Sao_Paulo";

function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// O jogo usa o horário oficial de Brasília (America/Sao_Paulo, UTC-3); dias que já
// passaram (arquivos) valem desde o lançamento.
function diaValido(dia, passados = false) {
  if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const t = Date.parse(dia + "T00:00:00-03:00");
  if (Number.isNaN(t)) return false;
  const hoje = Date.parse(hojeBrasil() + "T00:00:00-03:00");
  if (passados && t <= hoje) return t >= Date.parse("2026-10-28T00:00:00-03:00");
  return Math.abs(t - hoje) <= 86400000;
}

async function curva(db, dia) {
  const { results } = await db.prepare("SELECT faixa, n FROM histograma WHERE dia = ?").bind(dia).all();
  const contagem = new Array(ULTIMA + 1).fill(0);
  for (const r of results) if (r.faixa >= 0 && r.faixa <= ULTIMA) contagem[r.faixa] = r.n;
  return { dia, largura: LARGURA, contagem, total: contagem.reduce((s, n) => s + n, 0) };
}

// Quando o banco falha (limite do plano grátis, Cloudflare fora...), a curva não some: cada curva
// boa fica guardada no cache da Cloudflare e volta marcada com "guardada: true". Numa viagem nova,
// os pontos dela entram só na cópia devolvida, e o jogo guarda a viagem para mandar de novo depois.
const chaveCache = (dia) => new Request(`https://cache.nichoojogo.com/curva/${dia}`);

async function guardarCurva(c) {
  try {
    await caches.default.put(
      chaveCache(c.dia),
      new Response(JSON.stringify(c), { headers: { "cache-control": "public, max-age=604800" } }),
    );
  } catch {}
}

async function curvaGuardada(dia) {
  try {
    const r = await caches.default.match(chaveCache(dia));
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

async function semBanco(dia, pontos) {
  const c = (await curvaGuardada(dia)) || { dia, largura: LARGURA, contagem: new Array(ULTIMA + 1).fill(0), total: 0 };
  if (Number.isInteger(pontos)) {
    c.contagem[Math.floor(pontos / LARGURA)] += 1;
    c.total += 1;
  }
  return resposta({ ...c, guardada: true });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const dia = new URL(request.url).searchParams.get("dia") || hojeBrasil();
  if (!diaValido(dia, true)) return resposta({ erro: "dia inválido" }, 400);
  try {
    const c = await curva(env.DB, dia);
    waitUntil?.(guardarCurva(c));
    return resposta(c);
  } catch {
    return semBanco(dia, null);
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return resposta({ erro: "corpo inválido" }, 400);
  }
  const { dia, pontos } = corpo || {};
  const diaAlvo = dia || hojeBrasil();
  if (!diaValido(diaAlvo, true)) return resposta({ erro: "dia inválido" }, 400);
  if (!Number.isInteger(pontos) || pontos < 0 || pontos > MAXIMO) return resposta({ erro: "pontos inválidos" }, 400);
  try {
    await env.DB.prepare(
      "INSERT INTO histograma (dia, faixa, n) VALUES (?, ?, 1) ON CONFLICT (dia, faixa) DO UPDATE SET n = n + 1",
    )
      .bind(diaAlvo, Math.floor(pontos / LARGURA))
      .run();
    const c = await curva(env.DB, diaAlvo);
    waitUntil?.(guardarCurva(c));
    return resposta(c);
  } catch {
    return semBanco(diaAlvo, pontos);
  }
}
