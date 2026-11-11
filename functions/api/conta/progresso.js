// Progresso salvo na conta (Cloudflare Pages Function, em /api/conta/progresso).
//
//   GET  /api/conta/progresso                 -> { registros: { "2026-11-10": {historico, total, inicio, fim, noDia}, ... } }
//   POST /api/conta/progresso { registros }   guarda os registros (o mesmo formato de nicho:v7:<dia> no navegador)
//
// Regras (as mesmas do navegador, docs/ARQUIVOS.md):
//   - a 1ª viagem completa de cada dia nunca é sobrescrita; uma viagem pela metade só é trocada por
//     outra mais adiantada ou completa;
//   - a viagem completa do dia de HOJE (pelo relógio do servidor, horário de Brasília) entra no placar,
//     com os pontos conferidos pelo servidor (servidor/conta.js, conferirPontos). Dia que já virou não
//     entra mais: o placar de cada dia fecha às 23:59.

import {
  json, lerCorpo, mesmaOrigem, criarTabelas, contaDoPedido, limparRegistro, conferirPontos, hojeBrasil, diaComFormato, RODADAS,
  lerExtras, juntarExtras,
} from "../../../servidor/conta.js";

const LANCAMENTO = "2026-10-28";
const MAXIMO_REGISTROS = 400;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  await criarTabelas(env.DB);
  const conta = await contaDoPedido(request, env.DB);
  if (!conta) return json({ erro: "não está logado" }, 401);
  const { results } = await env.DB.prepare("SELECT dia, dados FROM progresso WHERE conta = ? ORDER BY dia DESC LIMIT 2000").bind(conta.id).all();
  const registros = {};
  for (const r of results) {
    try {
      registros[r.dia] = JSON.parse(r.dados);
    } catch {}
  }
  const linha = await env.DB.prepare("SELECT extras FROM contas WHERE id = ?").bind(conta.id).first();
  return json({ registros, extras: lerExtras(linha?.extras) });
}

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: "origem inválida" }, 403);
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) return json({ erro: "grande demais" }, 413);
  await criarTabelas(env.DB);
  const conta = await contaDoPedido(request, env.DB);
  if (!conta) return json({ erro: "não está logado" }, 401);
  const corpo = await lerCorpo(request);
  const brutos = corpo?.registros || {};
  if (typeof brutos !== "object") return json({ erro: "corpo inválido" }, 400);
  // skins liberadas, a escolhida e o código de apoiador (a Laika só com código pago)
  const extras = corpo.extras && typeof corpo.extras === "object" ? await juntarExtras(env.DB, conta.id, corpo.extras) : undefined;

  const hoje = hojeBrasil();
  const comandos = [];
  let deHoje = null;
  for (const [dia, bruto] of Object.entries(brutos).slice(0, MAXIMO_REGISTROS)) {
    if (!diaComFormato(dia) || dia < LANCAMENTO || dia > hoje) continue;
    const registro = limparRegistro(bruto);
    if (!registro || !registro.historico.length) continue;
    const completa = registro.historico.length >= RODADAS ? 1 : 0;
    comandos.push(
      env.DB.prepare(
        "INSERT INTO progresso (conta, dia, dados, completa) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT (conta, dia) DO UPDATE SET dados = excluded.dados, completa = excluded.completa, atualizado_em = datetime('now') " +
          "WHERE progresso.completa = 0 AND (excluded.completa = 1 OR " +
          "json_array_length(excluded.dados, '$.historico') > json_array_length(progresso.dados, '$.historico'))",
      ).bind(conta.id, dia, JSON.stringify(registro), completa),
    );
    if (dia === hoje && completa) deHoje = registro;
  }
  if (comandos.length) await env.DB.batch(comandos);

  // placar: só a viagem completa de hoje, e só a 1ª (ON CONFLICT DO NOTHING)
  let placar = null;
  if (deHoje) {
    // a que vale é a que ficou guardada (pode ser a de outro aparelho, que chegou antes)
    const guardada = await env.DB.prepare("SELECT dados FROM progresso WHERE conta = ? AND dia = ?").bind(conta.id, hoje).first();
    const valida = guardada ? JSON.parse(guardada.dados) : deHoje;
    const pontos = await conferirPontos(env.DB, hoje, valida);
    if (pontos !== null) {
      await env.DB.prepare("INSERT INTO viagens (conta, dia, pontos, no_dia) VALUES (?, ?, ?, 1) ON CONFLICT (conta, dia) DO NOTHING")
        .bind(conta.id, hoje, pontos)
        .run();
      const v = await env.DB.prepare("SELECT pontos FROM viagens WHERE conta = ? AND dia = ?").bind(conta.id, hoje).first();
      placar = { dia: hoje, pontos: v?.pontos ?? pontos };
    }
  }
  return json({ ok: true, guardados: comandos.length, placar, extras });
}
