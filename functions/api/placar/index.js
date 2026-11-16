// Placar do dia (Cloudflare Pages Function, em /api/placar).
//
//   GET /api/placar?dia=2026-11-10
//     -> { dia, fechado, total, top: [{ id, apelido, pontos, hora }], voce: { posicao, pontos, hora } | null, logado }
//
// Empate: fica na frente quem terminou primeiro ("hora", em Brasília, é quando a viagem completa chegou ao
// servidor). No mesmo segundo, vale a ordem de chegada. Ninguém divide posição.
//
// Só entra quem estava logado e terminou a viagem NO PRÓPRIO DIA (horário de Brasília). O placar de cada
// dia fica guardado junto com o dia (aparece no fim do jogo daquele dia, também pelos ARQUIVOS), mas só
// recebe viagens até 23:59; depois disso fica "fechado".
// "id" é o identificador aleatório da conta no jogo (não tem nada do Google): serve para denunciar.

import { json, criarTabelas, contaDoPedido, hojeBrasil, diaComFormato } from "../../../servidor/conta.js";

const TOP = 50;

// "2026-11-11 11:12:40" (UTC, do SQLite) -> "08:12:40" em Brasília
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function horaBrasil(utc) {
  const t = Date.parse(String(utc || "").replace(" ", "T") + "Z");
  return Number.isNaN(t) ? null : HORA.format(t);
}

// O quadro do dia (top 50 e a lista de pontos de todo mundo) é montado no banco no máximo uma vez a
// cada GUARDA_HOJE_S e fica no cache da Cloudflare; cada pedido só lê a própria viagem.
// Antes cada abertura do placar relia todas as viagens do dia umas três vezes (top, total e posição), e
// em 16/11 isso ajudou a estourar o limite grátis de linhas lidas do D1 (5 milhões por dia).
// Se o banco falhar, vale o último quadro guardado. A viagem de quem pediu entra na hora, mesmo que o
// quadro ainda não tenha ela.
const GUARDA_HOJE_S = 180;
const GUARDA_FECHADO_S = 86400;
const chaveQuadro = (dia) => new Request(`https://cache.nichoojogo.com/placar/${dia}`);
const cacheDaCloudflare = () => (typeof caches !== "undefined" ? caches.default : null);

// lista: [pontos, criada_em, rowid] de cada viagem, na ordem do placar
const antes = (a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]);

async function montarQuadro(db, dia) {
  const { results } = await db
    .prepare("SELECT pontos, criada_em, rowid AS ordem FROM viagens WHERE dia = ? AND no_dia = 1")
    .bind(dia)
    .all();
  const lista = results.map((r) => [r.pontos, r.criada_em, r.ordem]).sort(antes);
  const ids = lista.slice(0, TOP).map((l) => l[2]);
  let top = [];
  if (ids.length) {
    const { results: linhas } = await db
      .prepare(
        // apelido barrado depois de escolhido (à mão ou por denúncia) não aparece, nem antes do dono trocar
        "SELECT v.rowid AS ordem, v.conta AS id, CASE WHEN b.chave IS NULL THEN c.apelido ELSE 'Viajante oculto' END AS apelido, c.dev, v.pontos, v.criada_em " +
          "FROM viagens v JOIN contas c ON c.id = v.conta LEFT JOIN apelidos_barrados b ON b.chave = c.apelido_chave AND c.apelido_escolhido = 1 " +
          `WHERE v.rowid IN (${ids.map(() => "?").join(",")})`,
      )
      .bind(...ids)
      .all();
    top = linhas.sort((a, b) => antes([a.pontos, a.criada_em, a.ordem], [b.pontos, b.criada_em, b.ordem]));
  }
  return { lista, top };
}

async function lerQuadro(env, dia, fechado) {
  const cache = cacheDaCloudflare();
  let guardado = null;
  if (cache) {
    try {
      const r = await cache.match(chaveQuadro(dia));
      if (r) guardado = await r.json();
    } catch {}
  }
  const validade = (fechado ? GUARDA_FECHADO_S : GUARDA_HOJE_S) * 1000;
  if (guardado && Date.now() - guardado.em < validade) return guardado;
  try {
    const quadro = { ...(await montarQuadro(env.DB, dia)), em: Date.now() };
    if (cache) {
      await cache
        .put(chaveQuadro(dia), new Response(JSON.stringify(quadro), { headers: { "cache-control": `public, max-age=${GUARDA_FECHADO_S}` } }))
        .catch(() => {});
    }
    return quadro;
  } catch (erro) {
    if (guardado) return guardado;
    throw erro;
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const hoje = hojeBrasil();
  const dia = url.searchParams.get("dia") || hoje;
  if (!diaComFormato(dia) || dia > hoje) return json({ erro: "dia inválido" }, 400);
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  try {
    await criarTabelas(env.DB).catch(() => {});
    const conta = await contaDoPedido(request, env.DB).catch(() => null);
    const quadro = await lerQuadro(env, dia, dia < hoje);
    let { lista, top } = quadro;
    let voce = null;
    const meus = conta
      ? await env.DB.prepare("SELECT pontos, criada_em, rowid AS ordem FROM viagens WHERE dia = ? AND no_dia = 1 AND conta = ?")
          .bind(dia, conta.id)
          .first()
          .catch(() => null)
      : null;
    if (meus) {
      const eu = [meus.pontos, meus.criada_em, meus.ordem];
      if (!lista.some((l) => l[2] === eu[2])) {
        // viagem mais nova que o quadro guardado: entra agora na contagem e, se couber, no top
        lista = [...lista, eu];
        const minha = { ordem: eu[2], id: conta.id, apelido: conta.apelido, dev: conta.dev, pontos: eu[0], criada_em: eu[1] };
        top = [...top.filter((r) => r.id !== conta.id), minha]
          .sort((a, b) => antes([a.pontos, a.criada_em, a.ordem], [b.pontos, b.criada_em, b.ordem]))
          .slice(0, TOP);
      }
      const acima = lista.reduce((n, l) => n + (l[2] !== eu[2] && antes(l, eu) < 0 ? 1 : 0), 0);
      voce = { posicao: acima + 1, pontos: meus.pontos, hora: horaBrasil(meus.criada_em) };
    }
    return json({
      dia,
      fechado: dia < hoje,
      total: lista.length,
      top: top.map((r) => ({ id: r.id, apelido: r.apelido, pontos: r.pontos, hora: horaBrasil(r.criada_em), voce: r.id === conta?.id, ...(r.dev ? { dev: true } : {}) })),
      voce,
      logado: !!conta,
    });
  } catch {
    return json({ erro: "placar indisponível" }, 503);
  }
}
