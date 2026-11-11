// Trocar o apelido do placar (Cloudflare Pages Function, em /api/conta/apelido).
//   POST /api/conta/apelido { apelido }  -> { ok: true, apelido } ou { ok: false, motivo }
// Regras e filtro contra apelido ofensivo: servidor/apelidos.js e dados/apelidos-proibidos.js.

import { json, lerCorpo, mesmaOrigem, criarTabelas, contaDoPedido, trocarApelido } from "../../../servidor/conta.js";

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "origem inválida" }, 403);
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  await criarTabelas(env.DB);
  const conta = await contaDoPedido(request, env.DB);
  if (!conta) return json({ ok: false, motivo: "Entre na conta para escolher um apelido." }, 401);
  const corpo = await lerCorpo(request);
  if (typeof corpo?.apelido !== "string" || corpo.apelido.length > 64) return json({ ok: false, motivo: "Apelido inválido." }, 400);
  const r = await trocarApelido(env, conta, corpo.apelido);
  return json(r);
}
