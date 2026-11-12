// Refazer o dia de hoje de UMA pessoa (Cloudflare Pages Function, em /api/refazer).
//
// Para quando alguém foi prejudicado por um erro do jogo e precisa jogar o dia de novo valendo.
// Quem cuida do jogo cria um código no banco (só vale uma vez e só no dia dele) e manda o link
// https://nichoojogo.com/?refazer=<codigo> para a pessoa. Passo a passo em docs/CONTA.md.
//
//   POST /api/refazer {codigo}
//     -> { ok: true, dia }                o navegador apaga a viagem daquele dia e recarrega o jogo
//     -> { ok: false, motivo }            código que não existe, já usado ou de outro dia
//
// Se a pessoa estiver logada, apaga também a viagem dela daquele dia no servidor (progresso e placar),
// para a nova contar. Só a dela: o código não serve para mexer em mais ninguém.

import { json, criarTabelas, contaDoPedido, hojeBrasil, mesmaOrigem, lerCorpo } from "../../servidor/conta.js";

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ ok: false, motivo: "pedido de fora do site" }, 403);
  if (!env.DB) return json({ ok: false, motivo: "banco indisponível" }, 503);
  const codigo = String((await lerCorpo(request))?.codigo || "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(codigo)) return json({ ok: false, motivo: "Esse código não existe." });
  try {
    await criarTabelas(env.DB);
    const linha = await env.DB.prepare("SELECT dia, usado_em FROM refazer WHERE codigo = ?").bind(codigo).first();
    if (!linha) return json({ ok: false, motivo: "Esse código não existe." });
    if (linha.usado_em) return json({ ok: false, motivo: "Esse código já foi usado." });
    if (linha.dia !== hojeBrasil()) return json({ ok: false, motivo: "Esse código era de outro dia." });
    const conta = await contaDoPedido(request, env.DB).catch(() => null);
    // marca como usado antes de apagar: dois cliques ao mesmo tempo não usam o mesmo código duas vezes
    const marcou = await env.DB.prepare("UPDATE refazer SET usado_em = datetime('now'), conta = ? WHERE codigo = ? AND usado_em IS NULL")
      .bind(conta?.id || null, codigo)
      .run();
    if (!marcou.meta?.changes) return json({ ok: false, motivo: "Esse código já foi usado." });
    if (conta) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM progresso WHERE conta = ? AND dia = ?").bind(conta.id, linha.dia),
        env.DB.prepare("DELETE FROM viagens WHERE conta = ? AND dia = ?").bind(conta.id, linha.dia),
      ]);
    }
    return json({ ok: true, dia: linha.dia, logado: !!conta });
  } catch {
    return json({ ok: false, motivo: "Não deu agora. Tente de novo daqui a pouco." }, 503);
  }
}
