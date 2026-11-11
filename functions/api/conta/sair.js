// Sair da conta neste aparelho (Cloudflare Pages Function, em /api/conta/sair).
//   POST /api/conta/sair   apaga a sessão e o cookie. O progresso continua salvo na conta.

import { json, mesmaOrigem, lerCookie, resumo, cookieApagado } from "../../../servidor/conta.js";

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "origem inválida" }, 403);
  const token = lerCookie(request);
  if (token && env.DB) await env.DB.prepare("DELETE FROM sessoes WHERE token = ?").bind(await resumo(token)).run().catch(() => {});
  return json({ ok: true }, 200, { "set-cookie": cookieApagado(request) });
}
