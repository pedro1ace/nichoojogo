// Conta opcional (Cloudflare Pages Function, em /api/conta). Detalhes em servidor/conta.js e docs/CONTA.md.
//
//   GET    /api/conta   -> { google: "<client id>" | null, conta: { apelido, escolheuApelido } | null }
//   DELETE /api/conta   apaga a conta, as sessões, o progresso salvo e as viagens do placar

import { json, criarTabelas, contaDoPedido, contaPublica, mesmaOrigem, cookieApagado, esconderApelido } from "../../../servidor/conta.js";

export async function onRequestGet({ request, env }) {
  const google = env.GOOGLE_CLIENT_ID || null;
  if (!google || !env.DB) return json({ google: null, conta: null });
  try {
    await criarTabelas(env.DB);
    const conta = await contaDoPedido(request, env.DB);
    // apelido barrado depois de escolhido (à mão, em apelidos_barrados): volta para o automático e o jogo pede outro
    if (conta?.apelido_escolhido) {
      const barrado = await env.DB.prepare("SELECT 1 FROM apelidos_barrados WHERE chave = ?").bind(conta.apelido_chave).first();
      if (barrado) {
        conta.apelido = (await esconderApelido(env.DB, conta.id)) || conta.apelido;
        conta.apelido_escolhido = 0;
      }
    }
    return json({ google, conta: contaPublica(conta) });
  } catch {
    return json({ google, conta: null, erro: "banco indisponível" });
  }
}

export async function onRequestDelete({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "origem inválida" }, 403);
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  await criarTabelas(env.DB);
  const conta = await contaDoPedido(request, env.DB);
  if (!conta) return json({ erro: "não está logado" }, 401);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM viagens WHERE conta = ?").bind(conta.id),
    env.DB.prepare("DELETE FROM progresso WHERE conta = ?").bind(conta.id),
    env.DB.prepare("DELETE FROM denuncias WHERE alvo = ? OR autor = ?").bind(conta.id, conta.id),
    env.DB.prepare("DELETE FROM sessoes WHERE conta = ?").bind(conta.id),
    env.DB.prepare("DELETE FROM contas WHERE id = ?").bind(conta.id),
  ]);
  return json({ ok: true }, 200, { "set-cookie": cookieApagado(request) });
}
