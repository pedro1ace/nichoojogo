// Confere uma resposta contra as respostas escondidas do dia (Cloudflare Pages Function, em /api/conferir).
//
// Quem não está logado recebe o dia sem as respostas do espaço profundo e sem a singularidade
// (servidor/dias.js). Quando ele digita algo que não está na lista que recebeu, o jogo pergunta aqui.
// A busca é a mesma do jogo (servidor/busca.js, gerado de jogo/busca.js): grafia, apelidos, plural,
// "de/na/em" e a correção de erros de digitação, olhando a lista inteira da pergunta.
//
//   POST /api/conferir {dia, categoria, texto}
//     -> { achada: null }                                     não é uma das escondidas
//     -> { achada: {resposta, apelidos, pontos, ...}, nome, exato, supernova, curiosidade? }
//
// "exato: false" é a correção ("escorbutu" -> Escorbuto): o jogo corrige o campo e pede para confirmar,
// como faz com as respostas da lista. Só devolve uma resposta escondida: as outras o jogo já tem.

import { hojeBrasil, diaComFormato, lerCorpo } from "../../servidor/conta.js";
import { lerPacote, escondida } from "../../servidor/dias.js";
import { buscar, prepararCategoria } from "../../servidor/busca.js";

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// O dia já lido e preparado fica guardado enquanto esta cópia da Function estiver viva. Por até
// GUARDA_MS nem olha o banco (é uma chamada a cada palpite de quem não está logado); depois confere
// se houve carga nova do dia (dias.criado_em) e, se houve, prepara de novo.
const GUARDA_MS = 60000;
const guardados = new Map(); // dia -> { versao, lidoEm, categorias: Map(id -> preparada) }

async function categoriaDoDia(env, origem, dia, id, waitUntil) {
  let g = guardados.get(dia);
  if (!g || Date.now() - g.lidoEm > GUARDA_MS) {
    const pacote = await lerPacote(env, origem, dia, "completo", null, waitUntil);
    if (!pacote) return null;
    if (!g || g.versao !== pacote.versao) {
      const brutas = new Map(JSON.parse(pacote.texto).categorias.map((c) => [c.id, c]));
      g = { versao: pacote.versao, brutas, categorias: new Map() };
      if (guardados.size > 3) guardados.clear();
      guardados.set(dia, g);
    }
    g.lidoEm = Date.now();
  }
  if (!g.categorias.has(id)) {
    const cat = g.brutas.get(id);
    if (!cat) return null;
    g.categorias.set(id, prepararCategoria(cat));
  }
  return g.categorias.get(id);
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ erro: "banco indisponível" }, 503);
  const corpo = await lerCorpo(request).catch(() => null);
  const { dia, categoria, texto } = corpo || {};
  const hoje = hojeBrasil();
  if (!diaComFormato(dia) || dia > hoje) return json({ erro: "dia inválido" }, 400);
  if (typeof categoria !== "string" || !/^[a-z0-9-]{1,80}$/.test(categoria)) return json({ erro: "categoria inválida" }, 400);
  if (typeof texto !== "string" || !texto.trim() || texto.length > 80) return json({ achada: null });
  try {
    const cat = await categoriaDoDia(env, new URL(request.url).origin, dia, categoria, waitUntil);
    if (!cat) return json({ erro: "categoria não é deste dia" }, 404);
    const busca = buscar(cat, texto);
    if (!busca || !escondida(cat, busca.resposta)) return json({ achada: null });
    const supernova = busca.resposta.resposta === cat.supernova;
    return json({
      achada: busca.resposta,
      nome: busca.nome,
      exato: !!busca.exato,
      supernova,
      ...(supernova && cat.curiosidade ? { curiosidade: cat.curiosidade } : {}),
    });
  } catch (err) {
    return json({ erro: "falha ao conferir", detalhe: String(err) }, 500);
  }
}
