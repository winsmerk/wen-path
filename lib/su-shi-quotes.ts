export const suShiQuotes = [
  { text: "人生如逆旅，我亦是行人。", source: "《临江仙·送钱穆父》" },
  { text: "竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。", source: "《定风波·莫听穿林打叶声》" },
  { text: "但愿人长久，千里共婵娟。", source: "《水调歌头·明月几时有》" },
  { text: "休对故人思故国，且将新火试新茶。诗酒趁年华。", source: "《望江南·超然台作》" },
  { text: "腹有诗书气自华。", source: "《和董传留别》" },
  { text: "回首向来萧瑟处，归去，也无风雨也无晴。", source: "《定风波·莫听穿林打叶声》" },
  { text: "一点浩然气，千里快哉风。", source: "《水调歌头·黄州快哉亭赠张偓佺》" },
];

export function dailySuShiQuote(dateKey:string){
  let hash=2166136261;
  for(const char of dateKey)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return suShiQuotes[Math.abs(hash)%suShiQuotes.length];
}
