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

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const hoje = hojeBrasil();
  const dia = url.searchParams.get("dia") || hoje;
  if (!diaComFormato(dia) || dia > hoje) return json({ erro: "dia inválido" }, 400);
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  try {
    await criarTabelas(env.DB);
    const conta = await contaDoPedido(request, env.DB).catch(() => null);
    const [top, total, minha] = await env.DB.batch([
      env.DB.prepare(
        // apelido barrado depois de escolhido (à mão ou por denúncia) não aparece, nem antes do dono trocar
        "SELECT v.conta AS id, CASE WHEN b.chave IS NULL THEN c.apelido ELSE 'Viajante oculto' END AS apelido, c.dev, v.pontos, v.criada_em " +
          "FROM viagens v JOIN contas c ON c.id = v.conta LEFT JOIN apelidos_barrados b ON b.chave = c.apelido_chave AND c.apelido_escolhido = 1 " +
          "WHERE v.dia = ? AND v.no_dia = 1 ORDER BY v.pontos DESC, v.criada_em ASC, v.rowid ASC LIMIT ?",
      ).bind(dia, TOP),
      env.DB.prepare("SELECT COUNT(*) AS n FROM viagens WHERE dia = ? AND no_dia = 1").bind(dia),
      env.DB.prepare("SELECT pontos, criada_em, rowid AS ordem FROM viagens WHERE dia = ? AND no_dia = 1 AND conta = ?").bind(dia, conta?.id || ""),
    ]);
    let voce = null;
    const meus = minha.results[0];
    if (meus) {
      const acima = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM viagens WHERE dia = ? AND no_dia = 1 AND (pontos > ? OR (pontos = ? AND (criada_em < ? OR (criada_em = ? AND rowid < ?))))",
      )
        .bind(dia, meus.pontos, meus.pontos, meus.criada_em, meus.criada_em, meus.ordem)
        .first();
      voce = { posicao: (acima?.n || 0) + 1, pontos: meus.pontos, hora: horaBrasil(meus.criada_em) };
    }
    return json({
      dia,
      fechado: dia < hoje,
      total: total.results[0]?.n || 0,
      top: top.results.map((r) => ({ id: r.id, apelido: r.apelido, pontos: r.pontos, hora: horaBrasil(r.criada_em), voce: r.id === conta?.id, ...(r.dev ? { dev: true } : {}) })),
      voce,
      logado: !!conta,
    });
  } catch {
    return json({ erro: "placar indisponível" }, 503);
  }
}
