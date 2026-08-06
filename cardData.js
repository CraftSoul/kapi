import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let allCards = [];
export let cardIndex = {};
export let parentOfMap = {};
export let veteranMap = {};
export let becomesVeteranMap = {};

export function loadData() {
  const dataPath = path.join(__dirname, 'data.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(raw);
  const rawCards = data.cards || [];

  allCards = rawCards.map((raw, idx) => {
    const j = raw.json || {};
    const factionRaw = (j.faction || "").toLowerCase();
    return {
      id: raw.id ?? idx,
      cardId: j.id || raw.cardId || "",
      importId: raw.importId || j.import_id || "",
      titleZh: j.title?.["zh-Hans"] || j.title?.en || "未找到",
      titleEn: j.title?.["en-EN"] || "",
      text_zh: j.text?.["zh-Hans"] || "",
      textMap: j.text || {},
      titleMap: j.title || {},
      faction: factionRaw,
      type: j.type || "",
      rarity: j.rarity || "Standard",
      cost: j.kredits ?? 0,
      attack: j.attack,
      defense: j.defense,
      operationCost: j.operationCost,
      attributes: j.attributes || [],
      setName: j.set || "基础",
      image: j.image || "",
      reserved: raw.reserved === true,
      isSpawn: j.set === "OnlySpawnable",
      isVeteranSet: j.set === "Special",
      canCreate: j.can_create || [],
      rawJson: j,
      isCustom: false,
      imageData: null,
      imageFit: 'cover'
    };
  });

  // 构建索引
  cardIndex = {};
  for (const c of allCards) if (c.cardId) cardIndex[c.cardId] = c;

  parentOfMap = {};
  veteranMap = {};
  becomesVeteranMap = {};
  for (const c of allCards) {
    if (c.canCreate && c.canCreate.length) {
      for (const childId of c.canCreate) {
        if (!parentOfMap[childId]) parentOfMap[childId] = [];
        parentOfMap[childId].push(c.cardId);
      }
    }
  }
  for (const c of allCards) {
    const attrs = c.attributes || [];
    for (const a of attrs) {
      if (a.startsWith("BecomesVeteran:")) {
        const veteranId = a.replace("BecomesVeteran:", "");
        veteranMap[c.cardId] = veteranId;
        becomesVeteranMap[veteranId] = c.cardId;
      }
      if (a.startsWith("VeteranOf:")) {
        const originalId = a.replace("VeteranOf:", "");
        veteranMap[originalId] = c.cardId;
        becomesVeteranMap[c.cardId] = originalId;
      }
    }
  }
}

loadData();