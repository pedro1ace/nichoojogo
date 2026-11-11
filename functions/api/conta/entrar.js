// Login com Google (Cloudflare Pages Function, em /api/conta/entrar).
//
//   POST /api/conta/entrar { credential }   o ID token que o botão do Google entregou ao jogo
//     -> { conta: { apelido, escolheuApelido }, nova } e o cookie da sessão

import {
  json, lerCorpo, mesmaOrigem, criarTabelas, conferirTokenGoogle, acharOuCriarConta, criarSessao, cookieDaSessao,
} from "../../../servidor/conta.js";

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "origem inválida" }, 403);
  if (!env.GOOGLE_CLIENT_ID || !env.DB) return json({ erro: "login desligado" }, 503);
  const corpo = await lerCorpo(request);
  let dados;
  try {
    dados = await conferirTokenGoogle(corpo?.credential, env.GOOGLE_CLIENT_ID);
  } catch (erro) {
    return json({ erro: "não deu para confirmar o login do Google", detalhe: String(erro.message || erro) }, 401);
  }
  await criarTabelas(env.DB);
  const { id, nova } = await acharOuCriarConta(env.DB, dados.sub);
  const token = await criarSessao(env.DB, id);
  const conta = await env.DB.prepare("SELECT apelido, apelido_escolhido FROM contas WHERE id = ?").bind(id).first();
  return json(
    { conta: { apelido: conta.apelido, escolheuApelido: !!conta.apelido_escolhido }, nova },
    200,
    { "set-cookie": cookieDaSessao(token, request) },
  );
}
