// Testa o filtro de apelidos (servidor/apelidos.js): node scripts/testar_apelidos.mjs
// Falha (código 1) se um apelido ruim passar ou um apelido bom for barrado.
import { conferirApelido, palavraProibida } from "../servidor/apelidos.js";

const ruins = [
  "Hitler", "h1tl3r", "H.i.t.l.e.r", "hitlerzinho", "n4z1st4", "NaziGamer", "1488", "S3xo", "viado", "v1ad0",
  "viiiiado", "Viadinho", "cuzao", "c u z a o", "Kuzão", "puta", "put4", "fdp", "F.D.P", "Macaco",
  "macacopreto", "crioulo", "kr1oulo", "Buceta", "b0c3t4", "caralho123", "karalho", "Porra", "Merdinha", "shit",
  "fuck you", "phuck", "nigga", "n1gg4", "traveco", "retardado", "mongoloide", "estuprador", "pedofilo",
  "Mata Preto", "odeio gay", "admin", "Moderador", "Bolsonaro", "lula", "Viajante-1234", "aa", "ok!", "<script>",
  "xvideos", "onlyfans", "boiola", "Arrombado", "punhetao", "suicida", "talibã", "cocaína", "w h i t e p o w e r",
];
const bons = [
  "Pedro", "pedrinho", "Ana Cunha", "Computador", "Desviado", "Cuca", "Escudo", "Lucas", "Retardatário", "Pau-Brasil",
  "Nazaré", "Macacão", "Analista", "Fúcsia", "Shiitake", "Marte 2026", "Tardígrado", "Sagitário A", "Japa do Sushi",
  "Mãe do Neil", "Cosmonauta_88", "Isis", "Laika", "Cascudo", "Escuta", "Bichano", "Negociante", "Pretensioso",
  "Camila Nego", "Gay Astronauta", "Picapau", "Cacetinho", "Fofura", "Pintor", "Disputa", "Reputação",
];
let falhas = 0;
for (const a of ruins) {
  const r = conferirApelido(a);
  if (r.ok) { falhas++; console.log(`PASSOU (devia barrar): ${a}`); }
}
for (const a of bons) {
  const r = conferirApelido(a);
  if (!r.ok) { falhas++; console.log(`BARROU (devia passar): ${a}  -> ${r.motivo} [${palavraProibida(a)}]`); }
}
console.log(falhas ? `${falhas} falhas` : `ok: ${ruins.length} barrados, ${bons.length} liberados`);
process.exit(falhas ? 1 : 0);
