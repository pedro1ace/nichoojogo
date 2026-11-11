// Denunciar um apelido do placar (Cloudflare Pages Function, em /api/placar/denunciar).
//   POST /api/placar/denunciar { id }   (precisa estar logado)
//
// Cada conta denuncia cada apelido uma vez só, e no máximo DENUNCIAS_POR_DIA por dia. Com
// DENUNCIAS_PARA_ESCONDER denúncias de contas diferentes, o apelido sai do ar na hora: a conta volta
// para "Viajante-0000" e aquele apelido fica barrado (tabela apelidos_barrados) para todo mundo.
// Para desfazer um caso injusto: DELETE FROM apelidos_barrados WHERE chave = '...'.

import {
  json, lerCorpo, mesmaOrigem, criarTabelas, contaDoPedido, hojeBrasil, esconderApelido,
  DENUNCIAS_PARA_ESCONDER, DENUNCIAS_POR_DIA,
} from "../../../servidor/conta.js";

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "origem inválida" }, 403);
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  await criarTabelas(env.DB);
  const conta = await contaDoPedido(request, env.DB);
  if (!conta) return json({ ok: false, motivo: "Entre na conta para denunciar." }, 401);
  const corpo = await lerCorpo(request);
  const alvo = typeof corpo?.id === "string" ? corpo.id.slice(0, 40) : "";
  if (!alvo || alvo === conta.id) return json({ ok: false, motivo: "Denúncia inválida." }, 400);
  const alvoConta = await env.DB.prepare("SELECT apelido, apelido_chave, apelido_escolhido FROM contas WHERE id = ?").bind(alvo).first();
  if (!alvoConta) return json({ ok: false, motivo: "Esse viajante não existe mais." }, 404);
  // apelido automático (Viajante-0000) não tem o que denunciar
  if (!alvoConta.apelido_escolhido) return json({ ok: true, escondido: false });

  const hoje = hojeBrasil();
  const feitas = await env.DB.prepare("SELECT COUNT(*) AS n FROM denuncias WHERE autor = ? AND dia = ?").bind(conta.id, hoje).first();
  if ((feitas?.n || 0) >= DENUNCIAS_POR_DIA) return json({ ok: false, motivo: "Você já fez muitas denúncias hoje." }, 429);

  await env.DB.prepare("INSERT INTO denuncias (alvo, autor, apelido, dia) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(alvo, conta.id, alvoConta.apelido_chave, hoje)
    .run();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM denuncias WHERE alvo = ? AND apelido = ?")
    .bind(alvo, alvoConta.apelido_chave)
    .first();
  let escondido = false;
  if ((total?.n || 0) >= DENUNCIAS_PARA_ESCONDER) {
    await env.DB.prepare("INSERT INTO apelidos_barrados (chave, origem) VALUES (?, 'denuncia') ON CONFLICT DO NOTHING")
      .bind(alvoConta.apelido_chave)
      .run();
    escondido = !!(await esconderApelido(env.DB, alvo));
  }
  return json({ ok: true, escondido });
}
