// Passa palavras pela busca do jogo de verdade (servidor/busca.js, a mesma de jogo/busca.js), com a
// lista de jogo/dados.js. Usado pelo recusadas.py e pelo testar_buracos.py para ver se o JOGO aceita a
// palavra, e não só o casamento do fama.py (que é mais solto: "maluca" casa com Corrida maluca lá).
//
//   echo '[["tipos-de-corrida","maluca"]]' | node scripts/conferir_jogo.mjs
//     -> [["tipos-de-corrida","maluca","Corrida maluca"]]   (null quando o jogo recusa)
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { prepararCategoria, buscar } from "../servidor/busca.js";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const src = fs.readFileSync(raiz + "jogo/dados.js", "utf8");
const dados = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
const brutas = Array.isArray(dados.categorias) ? new Map(dados.categorias.map((c) => [c.id, c])) : new Map(Object.entries(dados.categorias));
const preparadas = new Map();
const pares = JSON.parse(fs.readFileSync(0, "utf8"));
const saida = pares.map(([id, texto]) => {
  if (!brutas.has(id)) return [id, texto, null];
  if (!preparadas.has(id)) preparadas.set(id, prepararCategoria(brutas.get(id)));
  const r = buscar(preparadas.get(id), texto, true);
  return [id, texto, r ? r.resposta.resposta : null];
});
process.stdout.write(JSON.stringify(saida));
