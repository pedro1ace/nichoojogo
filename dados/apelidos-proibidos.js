// O que não pode aparecer num apelido do placar (servidor/apelidos.js).
// O apelido é conferido sem acento, em minúsculas, com os números de "leetspeak" trocados por letras
// (n4z1 -> nazi), sem espaços, pontos e traços (h i t l e r -> hitler) e com as letras repetidas juntadas
// (viiiado -> viado). Depois disso:
//
//   "dentro": barra se aparecer EM QUALQUER LUGAR do apelido ("hitlerzinho", "oNazista"). Só entra aqui
//             o que não aparece dentro de palavras comuns: "puta" iria barrar "computador", então fica em "inteiras".
//   "inteiras": barra só a palavra inteira, ou o apelido inteiro ("cu", "viado", "puta"). "Desviado",
//             "Cuca" e "Computador" passam.
//
// O que escapar das listas ainda passa pelo juiz de IA (Workers AI), e qualquer jogador logado pode denunciar
// um apelido no placar: com DENUNCIAS_PARA_ESCONDER denúncias de contas diferentes, ele some e fica barrado.
// Para barrar à mão um apelido que já está no ar:
//   INSERT INTO apelidos_barrados (chave, origem) VALUES ('<apelido sem acento, minúsculo, só letras e números>', 'manual');
// O apelido some do placar na hora (aparece "Viajante oculto") e o dono volta para "Viajante-0000" quando abrir o jogo.
export default {
  dentro: [
    // ódio, nazismo, supremacia
    "hitler", "nazi", "nazis", "siegheil", "heilhitler", "suastica", "swastika", "auschwitz", "holocaust",
    "whitepower", "whitepride", "kukluxklan", "supremacistabranco", "arianismo", "racapura",
    "1488", "matapreto", "matanegro", "matagay", "matagays", "mataviado", "matajudeu", "matanordestino",
    "matamulher", "morteaos", "morteas", "odeiopreto", "odeionegro", "odeiogay", "odeiojudeu", "odeionordestino",
    // racismo
    "nigger", "nigga", "negrosujo", "pretosujo", "macacopreto", "crioulo", "tiziu", "chingling",
    "judeusujo", "judeusafado", "ciganoladrao", "baianosujo", "paraibasujo",
    // homofobia, transfobia, capacitismo, machismo
    "viadinho", "viadao", "boiola", "baitola", "traveco", "faggot", "tranny", "retardado",
    "mongoloide", "aleijado", "mulherzinha", "lugardemulher",
    // sexual e palavrões
    "caralho", "buceta", "boceta", "porra", "cuzao", "arrombad", "piroca", "punheta", "boquete", "xoxota",
    "xereca", "putaria", "vagabunda", "merd", "bosta", "fodase", "foder", "fuder", "fudid", "fodid",
    "porno", "pornhub", "xvideos", "onlyfans", "fuck", "motherf", "bitch", "pussy", "whore", "cunt", "bullshit",
    "estupr", "rapist", "pedofil", "pedobear", "zoofil", "incesto", "nudes",
    // violência, terrorismo, drogas
    "terrorist", "binladen", "talib", "massacre", "chacina", "columbine", "genocid", "suicid", "seumata",
    "cocaina", "maconheir", "traficant",
    // se passar pela equipe do jogo
    "admin", "moderador", "nichooficial", "nichoojogo", "equipenicho", "suportenicho",
  ],
  inteiras: [
    "cu", "cus", "fdp", "pqp", "vsf", "vtnc", "tnc", "kct", "krl", "crl", "pnc", "sexo", "sex", "nude",
    "puta", "puto", "putas", "putinha", "putinho", "foda", "fodao", "viado", "viados", "bicha", "bichona",
    "sapatao", "macaco", "macaca", "negao", "neguinho", "negrinho", "kkk", "rape", "retard", "shit",
    "fag", "fags", "cacete", "bunda", "tetas",
    "vadia", "piranha", "corno", "corna", "osama", "crack", "droga", "drogas", "maconha", "nazi",
    "bolsonaro", "lula", "trump", "bolsominion", "petista", "comunista", "lulista",
    "staff", "mod", "oficial", "nicho",
  ],
};
