// O pacote de perguntas de um dia (tabela "dias") e a versão dele sem as respostas raras.
//
// Quem não está logado recebe o dia de hoje (e os que ainda não chegaram) SEM as respostas do espaço
// profundo (60 pontos ou mais) e SEM a singularidade: nem o nome dela, nem a descrição. Assim não dá
// para abrir o "devtools" e copiar as respostas que valem mais. O que ele digitar e não estiver na lista
// que recebeu vai para /api/conferir, que procura entre as escondidas com a mesma busca do jogo
// (servidor/busca.js, gerado de jogo/busca.js). Quem está logado recebe tudo, como antes.
// Dias que já passaram vão completos para todo mundo: o placar deles já fechou.

export const PONTOS_ESCONDIDOS = 60; // a faixa ESPAÇO PROFUNDO começa aqui (jogo/cena.js, FAIXAS)

export const escondida = (cat, r) => r.pontos >= PONTOS_ESCONDIDOS || r.resposta === cat.supernova;

export function semRaras(pacote) {
  return {
    ...pacote,
    categorias: pacote.categorias.map((cat) => {
      const { supernova, curiosidade, ...resto } = cat;
      const respostas = cat.respostas.filter((r) => !escondida(cat, r));
      return { ...resto, respostas, ocultas: cat.respostas.length - respostas.length };
    }),
  };
}

// O pacote do dia, do cache da Cloudflare ou do banco: { texto, versao } ou null se o dia não existe.
// A chave do cache leva a hora da última carga daquele dia (dias.criado_em): carga nova, chave nova.
// "variante" separa no cache o pacote completo do sem raras.
export async function lerPacote(env, origem, dia, variante, montar, waitUntil) {
  const versao = await env.DB.prepare("SELECT criado_em FROM dias WHERE dia = ?").bind(dia).first();
  if (!versao) return null;
  const chave = new Request(`${origem}/api/dia?dia=${dia}&v=${encodeURIComponent(versao.criado_em || "")}&p=${variante}`);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    try {
      const guardado = await cache.match(chave);
      if (guardado) return { texto: await guardado.text(), versao: versao.criado_em };
    } catch {}
  }
  const row = await env.DB.prepare("SELECT payload FROM dias WHERE dia = ?").bind(dia).first();
  if (!row || !row.payload) return null;
  const texto = montar ? montar(row.payload) : row.payload;
  if (cache) {
    const guardar = cache
      .put(chave, new Response(texto, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" } }))
      .catch(() => {});
    if (typeof waitUntil === "function") waitUntil(guardar);
  }
  return { texto, versao: versao.criado_em };
}
