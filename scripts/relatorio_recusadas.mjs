// Relatório do dia: as recusadas mais digitadas, separadas pelo que falta consertar.
//
// Lê dados/sinais/revisao/recusadas-<dia>.csv (scripts/recusadas.py, com a coluna "ia" do plantão)
// e passa cada palavra pela busca atual (jogo/busca.js). Cada uma cai num balde:
//   já resolvida      a busca de hoje acha (direto ou sugerindo): nada a fazer
//   falta apelido     a IA aceitou, a resposta está na lista, mas a busca não chega nela
//   achou outra       a busca vai para uma resposta diferente da que a IA disse (lista duplicada?)
//   falta na lista    a IA aceitou algo que a lista não tem
//   sem julgamento    a IA ainda não julgou
//   recusada          a IA recusou (só aparece se a busca aceitar: aí é aceita indevida)
//
// Uso: node scripts/relatorio_recusadas.mjs [dia] [--top 15]
// Grava dados/sinais/revisao/relatorio-recusadas-<dia>.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarBusca, carregarCategorias, lerCsv } from "./avaliar_busca.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISAO = path.join(RAIZ, "dados", "sinais", "revisao");
const args = process.argv.slice(2);
const iTop = args.indexOf("--top");
const TOP = iTop >= 0 ? Number(args[iTop + 1]) : 15;
const posicionais = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--top");
const ultimo = fs.readdirSync(REVISAO).filter((f) => /^recusadas-\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort().pop();
const dia = posicionais[0] || (ultimo && ultimo.slice(10, 20));
const arquivo = path.join(REVISAO, `recusadas-${dia}.csv`);
if (!fs.existsSync(arquivo)) {
  console.error(`não achei ${path.relative(RAIZ, arquivo)} (rode scripts/recusadas.py ${dia} antes)`);
  process.exit(1);
}

const busca = carregarBusca(path.join(RAIZ, "jogo", "busca.js"));
const categorias = carregarCategorias();
const preparadas = new Map();
const baldes = { "falta apelido": [], "achou outra": [], "falta na lista": [], "aceita indevida": [], "sem julgamento": [], "já resolvida": [] };
let total = 0;
for (const r of lerCsv(arquivo)) {
  const cat = categorias[r.categoria];
  if (!cat) continue;
  if (!preparadas.has(r.categoria)) preparadas.set(r.categoria, busca.prepararCategoria(cat));
  const prep = preparadas.get(r.categoria);
  const n = Number(r.n) || 1;
  total += n;
  const achou = busca.buscar(prep, r.texto);
  const nomeIa = r.ia_nome || "";
  const alvo = r.ia === "aceita" && nomeIa ? prep.mapa.get(busca.compactar(nomeIa)) : null;
  const linha = { ...r, n, achou: achou ? achou.resposta.resposta + (achou.exato ? "" : " (sugere)") : "" };
  if (r.ia === "recusada") {
    if (achou && achou.exato && !prep.mapa.has(busca.compactar(r.texto))) baldes["aceita indevida"].push(linha);
    continue;
  }
  if (r.ia !== "aceita") { (achou ? baldes["já resolvida"] : baldes["sem julgamento"]).push(linha); continue; }
  if (!alvo) { (achou ? baldes["já resolvida"] : baldes["falta na lista"]).push(linha); continue; }
  linha.alvo = alvo.resposta.resposta;
  if (!achou) baldes["falta apelido"].push(linha);
  else if (achou.resposta !== alvo.resposta) baldes["achou outra"].push(linha);
  else baldes["já resolvida"].push(linha);
}

const soma = (l) => l.reduce((s, x) => s + x.n, 0);
const md = [`# Recusadas de ${dia}`, "", `${total} jogadores digitaram algo que o jogo recusou.`, "", "| Balde | Jogadores | Grafias |", "|---|---:|---:|"];
for (const [nome, l] of Object.entries(baldes)) md.push(`| ${nome} | ${soma(l)} | ${l.length} |`);
const explica = {
  "falta apelido": "A IA aceitou e a resposta está na lista, mas a busca não chega nela. Vira apelido (ou regra nova na busca).",
  "achou outra": "A busca leva para outra resposta. Quase sempre é a mesma coisa listada duas vezes: juntar.",
  "falta na lista": "A IA aceitou algo que a lista não tem: resposta nova.",
  "aceita indevida": "A IA recusou, mas a busca de hoje aceita direto. Conferir a regra que casou.",
  "sem julgamento": "A IA ainda não julgou.",
};
for (const [nome, texto] of Object.entries(explica)) {
  const l = baldes[nome].sort((a, b) => b.n - a.n).slice(0, TOP);
  if (!l.length) continue;
  md.push("", `## ${nome}`, "", texto, "", "| n | categoria | digitado | IA | busca |", "|---:|---|---|---|---|");
  for (const x of l) md.push(`| ${x.n} | ${x.categoria} | ${x.texto} | ${x.alvo || x.ia_nome || ""} | ${x.achou || "-"} |`);
}
const saida = path.join(REVISAO, `relatorio-recusadas-${dia}.md`);
fs.writeFileSync(saida, md.join("\n") + "\n");
console.log(md.slice(0, 12).join("\n"));
console.log(`\n${path.relative(RAIZ, saida)}`);
