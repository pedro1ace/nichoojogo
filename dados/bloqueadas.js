// Palavras que o juiz de IA (functions/api/juiz.js) nunca aceita, e que o plantão
// (scripts/plantao_automatico.py) nunca põe sozinho na lista. Vale a palavra inteira, sem acento
// e em minúsculas ("Epstein", "ilha do epstein" e "EPSTEIN" caem todas em "epstein").
// Só pega respostas que a lista não tinha: o que já está na lista continua valendo.
// O plantão lê este arquivo como JSON: mantenha só strings entre aspas duplas, uma lista só.
export default [
  "epstein", "diddy", "hitler", "nazi", "nazista", "nazismo", "suastica", "holocausto", "kkk",
  "isis", "taliba", "bin laden", "osama", "terrorista", "terrorismo", "massacre", "chacina",
  "columbine", "atentado", "genocidio", "estupro", "estuprador", "pedofilo", "pedofilia", "abuso",
  "porno", "pornografia", "porn", "onlyfans", "sexo", "nude", "nudes", "putaria", "puta", "puto",
  "caralho", "buceta", "boceta", "porra", "cu", "cuzao", "arrombado", "foda", "foder", "fodase", "fdp",
  "vagabunda", "vadia", "merda", "bosta", "xoxota", "xereca", "punheta", "boquete", "piroca",
  "viado", "traveco", "sapatao", "macumbeiro", "favelado", "retardado", "aleijado",
  "nego", "negao", "crioulo", "tiziu", "japa", "chingling", "judeu safado",
  "zoofilia", "suicidio", "se matar", "overdose", "cocaina", "crack", "maconha", "heroina", "droga", "drogas",
  "bolsonaro", "trump", "comunista", "petista", "bolsominion",
];
