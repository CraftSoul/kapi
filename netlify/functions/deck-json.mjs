import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ==================== 数据加载 ====================
let allCards = [];
let cardIndex = {};
let parentOfMap = {};
let veteranMap = {};
let becomesVeteranMap = {};

function loadData() {
  const dataPath = path.join(HERE, 'data.json');
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
      rawJson: j
    };
  });

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

// ==================== 常量 ====================
const allNationOptions = ["germany", "britain", "japan", "soviet", "usa", "france", "italy", "poland", "finland", "anzac"];
const factionNames = {
  soviet: "苏联", usa: "美国", poland: "波兰", neutral: "中立", japan: "日本",
  italy: "意大利", france: "法国", britain: "英国", finland: "芬兰", germany: "德国", anzac: "澳新军团"
};

// ==================== 解析卡组代码 ====================
function parseNationCode(codeChar) {
  if (codeChar >= '1' && codeChar <= '9') return parseInt(codeChar, 10);
  if (codeChar === 'a') return 10;
  return 1;
}

function parseDeckCode(rawCode) {
  const startIdx = rawCode.indexOf('%%');
  if (startIdx === -1) throw new Error('未找到 %%');
  let code = rawCode.substring(startIdx + 2);
  const pipeIdx = code.indexOf('|');
  if (pipeIdx === -1) throw new Error('未找到 |');
  const nationPart = code.substring(0, pipeIdx).trim();
  if (nationPart.length < 2) throw new Error('编号无效');
  const mainIdx = parseNationCode(nationPart[0]);
  const allyIdx = parseNationCode(nationPart[1]);
  if (mainIdx < 1 || mainIdx > 10) throw new Error('主国编号错误');
  if (allyIdx < 1 || allyIdx > 10) throw new Error('盟国编号错误');
  const mainFaction = allNationOptions[mainIdx - 1];
  const allyFaction = allNationOptions[allyIdx - 1];
  const cardsPart = code.substring(pipeIdx + 1);
  const regions = cardsPart.split(';');
  while (regions.length < 4) regions.push('');
  const multipliers = [1, 2, 3, 4];
  const importIdMap = new Map();
  for (let i = 0; i < 4; i++) {
    const region = regions[i];
    const mult = multipliers[i];
    for (let j = 0; j < region.length; j += 2) {
      const importId = region.substring(j, j + 2);
      if (importId.length === 2) importIdMap.set(importId, (importIdMap.get(importId) || 0) + mult);
    }
  }
  const cardEntries = [];
  for (const [importId, count] of importIdMap.entries()) {
    const card = allCards.find(c => c.importId === importId);
    if (card) cardEntries.push({ card, count });
  }
  return { mainFaction, allyFaction, cardEntries };
}

// ==================== 序列化 ====================
function serializeCard(c) {
  return {
    id: c.id, cardId: c.cardId, importId: c.importId,
    titleZh: c.titleZh, titleEn: c.titleEn, text_zh: c.text_zh,
    textMap: c.textMap, titleMap: c.titleMap,
    faction: c.faction, type: c.type, rarity: c.rarity,
    cost: c.cost, attack: c.attack, defense: c.defense,
    operationCost: c.operationCost, attributes: c.attributes,
    setName: c.setName, image: c.image, reserved: c.reserved,
    isSpawn: c.isSpawn, isVeteranSet: c.isVeteranSet,
    canCreate: c.canCreate
  };
}

function buildDeckJson(deckCode) {
  const parsed = parseDeckCode(deckCode);
  const { mainFaction, allyFaction, cardEntries } = parsed;

  const cards = cardEntries.map(({ card, count }) => ({
    count,
    card: serializeCard(card)
  }));

  cards.sort((a, b) => {
    if (a.card.cost !== b.card.cost) return a.card.cost - b.card.cost;
    return a.card.cardId.localeCompare(b.card.cardId, undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalCards = cards.reduce((s, e) => s + e.count, 0);

  return {
    mainFaction,
    allyFaction,
    mainFactionName: factionNames[mainFaction] || mainFaction,
    allyFactionName: factionNames[allyFaction] || allyFaction,
    totalCards,
    uniqueCards: cards.length,
    cards
  };
}

// ==================== 函数入口 ====================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS_HEADERS });
  }

  let deckCode = null;
  if (req.method === 'GET') {
    const url = new URL(req.url);
    deckCode = url.searchParams.get('deckCode');
  } else if (req.method === 'POST') {
    try {
      const body = await req.json();
      deckCode = body.deckCode;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if (!deckCode) {
    return new Response(JSON.stringify({ error: 'Missing deckCode' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const result = buildDeckJson(deckCode);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (err) {
    console.error('解析卡组失败:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}