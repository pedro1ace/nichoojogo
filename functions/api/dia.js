// Pacote das 7 categorias do dia (Cloudflare Pages Function, em /api/dia).
//
// Retorna apenas as perguntas e respostas do dia solicitado, reduzindo o download
// inicial do jogo de ~9.7 MB para ~150 KB.
//
//   GET /api/dia?dia=2026-11-03   devolve as 7 categorias daquele dia
//
// Usa o binding D1 (DB), tabela 'dias' (ver banco/schema.sql).
//
// Respostas escondidas (servidor/dias.js): quem não está logado recebe o dia de hoje sem as respostas do
// espaço profundo e sem a singularidade (cada categoria vem com "ocultas": quantas ficaram de fora). O jogo
// confere o que digitar contra elas em /api/conferir. Dias que ainda não chegaram vão sempre sem elas,
// até para quem está logado. Dias que já passaram vão completos para todo mundo.
//
// Cache: o pacote de cada dia fica no cache da Cloudflare (Cache API), para o banco não ler o
// payload grande a cada jogador. A chave do cache leva a hora da última carga daquele dia
// (dias.criado_em, que a carga_dias.sql atualiza): cada carga nova cai numa chave nova e aparece
// na hora. Antes a chave era só o dia, e um pacote velho ficou preso no cache por horas depois
// das cargas de 04-05/11 (as singularidades novas do Dia 9 não apareciam no jogo).
// (O cache só funciona no domínio próprio, nichoojogo.com; nas prévias *.pages.dev ele é ignorado.)
// No navegador, o dia de hoje não fica guardado ("private, no-cache"): a mesma URL muda de conteúdo
// quando a pessoa entra na conta.

import { contaDoPedido, hojeBrasil, diaComFormato } from "../../servidor/conta.js";
import { lerPacote, semRaras } from "../../servidor/dias.js";

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const hoje = hojeBrasil();
  const dia = url.searchParams.get("dia") || hoje;

  if (!diaComFormato(dia)) {
    return json({ erro: "formato de dia inválido (use AAAA-MM-DD)" }, 400);
  }

  if (!env.DB) {
    return json({ erro: "banco D1 não configurado" }, 500);
  }

  try {
    let completo = dia < hoje;
    if (dia === hoje) completo = !!(await contaDoPedido(request, env.DB).catch(() => null));
    const pacote = await lerPacote(
      env,
      url.origin,
      dia,
      completo ? "completo" : "semraras",
      completo ? null : (bruto) => JSON.stringify(semRaras(JSON.parse(bruto))),
      waitUntil,
    );
    if (!pacote) return json({ erro: "dia não encontrado no banco", dia }, 404);
    return new Response(pacote.texto, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // dia passado: navegador guarda 5 minutos; hoje e futuro: muda quando a pessoa entra na conta
        "cache-control": dia < hoje ? "public, max-age=300, s-maxage=3600" : "private, no-cache",
      },
    });
  } catch (err) {
    return json({ erro: "falha ao consultar banco", detalhe: String(err) }, 500);
  }
}
