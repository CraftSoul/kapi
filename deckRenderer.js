import { createCanvas, loadImage, registerFont } from 'canvas';
import QRCode from 'qrcode';
import { allCards, cardIndex, parentOfMap, veteranMap, becomesVeteranMap } from './cardData.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 注册字体
try {
  const fontPath = path.join(__dirname, 'font.ttf');
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: 'CustomFont' });
    console.log('✅ 字体注册成功');
  } else {
    console.warn('⚠️ font.ttf 不存在，路径:', fontPath);
  }
} catch (e) {
  console.warn('字体注册失败:', e.message);
}

const FONT_FAMILY = '"CustomFont", "Microsoft YaHei", "Noto Sans SC", sans-serif';

// ---------- 常量定义 ----------
const VERSION = 52;
const DEFAULT_VERSION = `v${VERSION}`;
const factionNames = {
  soviet: "苏联", usa: "美国", poland: "波兰", neutral: "中立", japan: "日本",
  italy: "意大利", france: "法国", britain: "英国", finland: "芬兰", germany: "德国", anzac: "澳新军团"
};
const factionColor = {
  germany: "#5A5F55", britain: "#857A60", soviet: "#4F3826", usa: "#434B32",
  japan: "#90723C", france: "#283454", italy: "#555248", poland: "#645633",
  finland: "#C9C8BC", anzac: "#9E6F34", neutral: "#6b6e5c"
};
const allNationOptions = ["germany", "britain", "japan", "soviet", "usa", "france", "italy", "poland", "finland", "anzac"];

// 阵营 SVG 图标缓存
const factionIconCache = new Map();

// ---------- 加载阵营图标 ----------
async function loadFactionIcon(factionKey) {
  if (factionIconCache.has(factionKey)) {
    return factionIconCache.get(factionKey);
  }

  try {
    const iconPath = path.join(__dirname, `${factionKey}.svg`);
    if (fs.existsSync(iconPath)) {
      const svgBuffer = fs.readFileSync(iconPath);
      const svgDataUrl = `data:image/svg+xml;base64,${svgBuffer.toString('base64')}`;
      const img = await loadImage(svgDataUrl);
      factionIconCache.set(factionKey, img);
      return img;
    }
    console.warn(`⚠️ 阵营图标 ${factionKey} 本地不存在，跳过`);
    return null;
  } catch (e) {
    console.warn(`无法加载阵营图标 ${factionKey}:`, e.message);
    return null;
  }
}

// ---------- 预加载所有阵营图标 ----------
async function preloadFactionIcons() {
  const promises = allNationOptions.map(key => loadFactionIcon(key));
  await Promise.all(promises);
  console.log('✅ 所有阵营图标加载完成');
}

// ---------- 工具函数 ----------
function getCardImageUrl(imgName, lang, version) {
  if (!imgName) return "";
  const ver = version || DEFAULT_VERSION;
  return `https://www.kards.com/images/card/${ver}/${lang}/${imgName}`;
}

async function loadImageWithSharp(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return await loadImage(buffer);
  } catch (error) {
    console.error('加载图片失败:', error);
    throw new Error(`加载图片失败: ${error.message}`);
  }
}

async function probeImageExists(imgName, lang, version) {
  if (!imgName) return false;
  const url = getCardImageUrl(imgName, lang, version);
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function getEffectiveSet(card, visited = new Set()) {
  if (visited.has(card.cardId)) return card.setName;
  visited.add(card.cardId);
  if (card.setName === "OnlySpawnable") {
    const parents = parentOfMap[card.cardId] || [];
    for (const pid of parents) {
      const p = cardIndex[pid];
      if (p) {
        const es = getEffectiveSet(p, visited);
        if (es && es !== "OnlySpawnable" && es !== "Special") return es;
      }
    }
    return "OnlySpawnable";
  }
  if (card.setName === "Special") {
    const originalId = becomesVeteranMap[card.cardId];
    if (originalId) {
      const original = cardIndex[originalId];
      if (original) {
        const es = getEffectiveSet(original, visited);
        if (es && es !== "Special") return es;
      }
    }
    return "Special";
  }
  return card.setName;
}

// ---------- 解析卡组代码 ----------
function getNationCode(faction) {
  const idx = allNationOptions.indexOf(faction);
  if (idx === -1) return '1';
  const num = idx + 1;
  return num === 10 ? 'a' : num.toString();
}

function parseNationCode(codeChar) {
  if (codeChar >= '1' && codeChar <= '9') return parseInt(codeChar, 10);
  if (codeChar === 'a') return 10;
  return 1;
}

export function parseDeckCode(rawCode) {
  const startIdx = rawCode.indexOf('%%');
  if (startIdx === -1) throw new Error('未找到 %%');
  let code = rawCode.substring(startIdx + 2);
  const pipeIdx = code.indexOf('|');
  if (pipeIdx === -1) throw new Error('未找到 |');
  const nationPart = code.substring(0, pipeIdx).trim();
  if (nationPart.length < 2) throw new Error('编号无效');
  const mainCode = nationPart[0];
  const allyCode = nationPart[1];
  const mainIdx = parseNationCode(mainCode);
  const allyIdx = parseNationCode(allyCode);
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

// ---------- 总部卡 ----------
async function fetchHeadquarterCard(cardId, lang) {
  if (!cardId || cardId.trim() === '') return null;
  const formatted = cardId.trim().toLowerCase().replace(/[&!\/\\\'"(),-]/g, '').replace(/[\.\s]+/g, '_').replace(/^_+|_+$/g, '');
  if (!formatted) return null;
  const imgName = `${formatted}.avif`;
  const exists = await probeImageExists(imgName, lang, DEFAULT_VERSION);
  if (!exists) return null;
  return {
    id: -1,
    cardId: 'headquarter',
    titleZh: '总部',
    titleEn: 'Headquarters',
    image: imgName,
    faction: 'neutral',
    type: 'order',
    rarity: 'Standard',
    cost: 0,
    attack: undefined,
    defense: undefined,
    operationCost: undefined,
    attributes: [],
    setName: 'Base',
    reserved: false,
    isSpawn: false,
    isVeteranSet: false,
    canCreate: [],
    isHeadquarter: true,
    isCustom: false,
    imageData: null,
    importId: ''
  };
}

// ---------- 绘制统计卡（带阵营图标） ----------
async function drawStatsCard(ctx, x, y, w, h, radius, customTitle, mainNation, allyNation, deckMap, cardCostMap) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = "#1a1c12";
  ctx.fill();
  ctx.strokeStyle = "#c9aa5b";
  ctx.lineWidth = 2;
  ctx.stroke();

  const title = customTitle || "卡组统计";
  let mainCount = 0, allyCount = 0, otherCount = 0;
  let rarityCounts = { Standard: 0, Limited: 0, Special: 0, Elite: 0 };
  const costMap = {};
  for (let i = 0; i <= 7; i++) costMap[i] = { unit: 0, order: 0, counter: 0 };
  let unitTotal = 0, orderTotal = 0, counterTotal = 0, totalCostSum = 0, totalCardsCount = 0;
  for (const { card, count } of deckMap.values()) {
    if (card.faction === mainNation) mainCount += count;
    else if (card.faction === allyNation) allyCount += count;
    else otherCount += count;
    if (rarityCounts.hasOwnProperty(card.rarity)) rarityCounts[card.rarity] += count;
    const effectiveCost = cardCostMap.get(card.cardId) ?? card.cost;
    const cat = effectiveCost >= 7 ? 7 : effectiveCost;
    const typeCat = card.type === "order" ? "order" : card.type === "countermeasure" ? "counter" : "unit";
    if (typeCat === "unit") { costMap[cat].unit += count; unitTotal += count; }
    else if (typeCat === "order") { costMap[cat].order += count; orderTotal += count; }
    else { costMap[cat].counter += count; counterTotal += count; }
    totalCostSum += effectiveCost * count;
    totalCardsCount += count;
  }
  const avgCost = totalCardsCount > 0 ? (totalCostSum / totalCardsCount) : 0;
  const totalCards = Array.from(deckMap.values()).reduce((s, e) => s + e.count, 0);

  ctx.fillStyle = "#ffefbf";
  ctx.font = `bold ${Math.floor(h * 0.08)}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(title, x + w / 2, y + h * 0.10);

  ctx.font = `${Math.floor(h * 0.05)}px ${FONT_FAMILY}`;
  ctx.textAlign = "left";
  const startY = y + h * 0.22;
  const lineH = h * 0.075;
  const iconSize = Math.floor(h * 0.06);

  const mainIcon = await loadFactionIcon(mainNation);
  const allyIcon = await loadFactionIcon(allyNation);

  if (mainIcon) {
    ctx.drawImage(mainIcon, x + w * 0.05, startY - iconSize * 0.7, iconSize, iconSize);
  } else {
    ctx.fillStyle = factionColor[mainNation] || "#c9aa5b";
    ctx.fillRect(x + w * 0.05, startY - iconSize * 0.7, iconSize, iconSize);
  }
  ctx.fillStyle = factionColor[mainNation] || "#c9aa5b";
  ctx.fillText(`${factionNames[mainNation]}: ${mainCount}`, x + w * 0.05 + iconSize + 5, startY + 2);

  if (allyIcon) {
    ctx.drawImage(allyIcon, x + w * 0.05, startY + lineH - iconSize * 0.7, iconSize, iconSize);
  } else {
    ctx.fillStyle = factionColor[allyNation] || "#c9aa5b";
    ctx.fillRect(x + w * 0.05, startY + lineH - iconSize * 0.7, iconSize, iconSize);
  }
  ctx.fillStyle = factionColor[allyNation] || "#c9aa5b";
  ctx.fillText(`${factionNames[allyNation].slice(0,2)}: ${allyCount}`, x + w * 0.05 + iconSize + 5, startY + lineH + 2);

  let lineOffset = 2;
  if (otherCount > 0) {
    ctx.fillStyle = "#a0a0a0";
    ctx.fillText(`其他: ${otherCount}`, x + w * 0.05 + iconSize + 5, startY + lineH * 2 + 2);
    lineOffset = 3;
  }
  ctx.fillStyle = "#e9dbbd";
  ctx.fillText(`总计: ${totalCards}`, x + w * 0.05 + iconSize + 5, startY + lineH * lineOffset + 2);

  const rarityY = startY;
  const col2X = x + w * 0.52;
  ctx.textAlign = "left";
  ctx.fillStyle = "#9e9e9e";
  ctx.fillText(`普通: ${rarityCounts.Standard}`, col2X, rarityY + 2);
  ctx.fillStyle = "#cd7f32";
  ctx.fillText(`限定: ${rarityCounts.Limited}`, col2X, rarityY + lineH + 2);
  ctx.fillStyle = "#c0c0c0";
  ctx.fillText(`特殊: ${rarityCounts.Special}`, col2X, rarityY + lineH * 2 + 2);
  ctx.fillStyle = "#ffd700";
  ctx.fillText(`精英: ${rarityCounts.Elite}`, col2X, rarityY + lineH * 3 + 2);

  ctx.fillStyle = "#ffefb9";
  ctx.font = `${Math.floor(h * 0.045)}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(`平均费用: ${avgCost.toFixed(2)}`, x + w / 2, rarityY + lineH * 4 + 10);

  const barAreaY = y + h * 0.68;
  const barAreaH = h * 0.28;
  const barStartX = x + w * 0.06;
  const barWidth = (w * 0.88) / 8;
  const barMaxHeight = barAreaH * 0.75;
  const barGap = 2;

  let maxCount = 1;
  for (let i = 0; i <= 7; i++) {
    const total = costMap[i].unit + costMap[i].order + costMap[i].counter;
    if (total > maxCount) maxCount = total;
  }

  for (let i = 0; i <= 7; i++) {
    const bx = barStartX + i * barWidth;
    const unit = costMap[i].unit || 0;
    const order = costMap[i].order || 0;
    const counter = costMap[i].counter || 0;
    const total = unit + order + counter;

    const unitH = maxCount > 0 ? (unit / maxCount) * barMaxHeight : 0;
    const orderH = maxCount > 0 ? (order / maxCount) * barMaxHeight : 0;
    const counterH = maxCount > 0 ? (counter / maxCount) * barMaxHeight : 0;

    let currentY = barAreaY + barMaxHeight;

    if (unit > 0) {
      ctx.fillStyle = '#e8e4d0';
      ctx.fillRect(bx, currentY - unitH, barWidth - barGap, unitH);
      currentY -= unitH;
    }
    if (order > 0) {
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(bx, currentY - orderH, barWidth - barGap, orderH);
      currentY -= orderH;
    }
    if (counter > 0) {
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(bx, currentY - counterH, barWidth - barGap, counterH);
      currentY -= counterH;
    }

    ctx.fillStyle = "#f5eaca";
    ctx.font = `${Math.floor(h * 0.035)}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.fillText(i === 7 ? "7K+" : `${i}K`, bx + (barWidth - barGap) / 2, barAreaY + barMaxHeight + h * 0.045);

    if (total > 0) {
      ctx.fillStyle = "#ffefb9";
      ctx.font = `${Math.floor(h * 0.03)}px ${FONT_FAMILY}`;
      ctx.fillText(total, bx + (barWidth - barGap) / 2, barAreaY + barMaxHeight - unitH - orderH - counterH - h * 0.025);
    } else {
      ctx.fillStyle = "#ffefb9";
      ctx.font = `${Math.floor(h * 0.03)}px ${FONT_FAMILY}`;
      ctx.fillText("0", bx + (barWidth - barGap) / 2, barAreaY + barMaxHeight - h * 0.025);
    }
  }
  ctx.restore();
}

// ---------- 绘制二维码卡 ----------
async function drawQrCard(ctx, x, y, w, h, radius, qrCodeData, customTitle) {
  if (!qrCodeData) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = "#1a1c12";
  ctx.fill();
  ctx.strokeStyle = "#c9aa5b";
  ctx.lineWidth = 2;
  ctx.stroke();

  const title = customTitle || "卡组二维码";
  ctx.fillStyle = "#ffefbf";
  ctx.font = `bold ${Math.floor(h * 0.08)}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(title, x + w / 2, y + h * 0.10);

  const qrSize = Math.min(w * 0.7, h * 0.5);
  const qrBuffer = await QRCode.toBuffer(qrCodeData, {
    width: Math.floor(qrSize),
    margin: 0,
    color: { dark: '#f5c542', light: '#1a1c12' }
  });
  const qrImg = await loadImage(qrBuffer);
  const qrX = x + (w - qrSize) / 2;
  const qrY = y + h * 0.18;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  const maxLineWidth = qrSize * 0.9;
  const fontSize = Math.floor(h * 0.035);
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = "#c9b06b";
  ctx.textAlign = "center";

  let lines = [];
  let currentLine = '';
  for (let i = 0; i < qrCodeData.length; i++) {
    const char = qrCodeData[i];
    const testLine = currentLine + char;
    if (ctx.measureText(testLine).width > maxLineWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.5;
  const startY = qrY + qrSize + 20;
  for (let i = 0; i < lines.length; i++) {
    const lineY = startY + i * lineHeight;
    if (lineY > y + h - 10) break;
    ctx.fillText(lines[i], x + w / 2, lineY);
  }
  ctx.restore();
}

// ---------- 排序比较函数 ----------
function compareCardsForDisplay(a, b, cardCostMap, cardStarMap) {
  if (a.card.isHeadquarter && !b.card.isHeadquarter) return -1;
  if (!a.card.isHeadquarter && b.card.isHeadquarter) return 1;

  const costA = cardCostMap.get(a.card.cardId) ?? a.card.cost;
  const costB = cardCostMap.get(b.card.cardId) ?? b.card.cost;
  if (costA !== costB) return costA - costB;

  return a.card.cardId.localeCompare(b.card.cardId, undefined, { numeric: true, sensitivity: 'base' });
}

// ---------- 主绘制函数 ----------
async function generateDeckImageWithOptions(
  cardsWithVersion,
  {
    cols = 10,
    quality = 20,
    lang = 'zh-Hans',
    addStatsCard = true,
    bgColor = '#ffffff',
    qrEnabled = false,
    statsTitle = null,
    qrTitle = null,
    spacingX = 0,
    spacingY = 0,
    mainNation,
    allyNation,
    deckMap,
    cardCostMap,
    cardStarMap
  } = {}
) {
  if (!cardsWithVersion || cardsWithVersion.length === 0) throw new Error("卡组为空");
  const hasValid = cardsWithVersion.some(item => item !== null);
  if (!hasValid) throw new Error("没有有效卡片");

  const scaleFactor = quality / 100;
  const cardW = Math.floor(500 * scaleFactor);
  const cardH = Math.floor(702 * scaleFactor);
  const radius = Math.max(2, Math.floor(15 * scaleFactor));
  const totalSlots = cardsWithVersion.length + (addStatsCard ? 1 : 0) + (qrEnabled ? 1 : 0);
  const rows = Math.ceil(totalSlots / cols);
  const canvas = createCanvas(
    cols * cardW + (cols - 1) * spacingX,
    rows * cardH + (rows - 1) * spacingY
  );
  const ctx = canvas.getContext('2d');

  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const drawTagWithArrow = (text, x, y, color, bgColorTag = 'rgba(0,0,0,0.85)') => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.font = `bold 28px ${FONT_FAMILY}`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const pad = 12;
    const rectW = textWidth + pad * 2;
    const rectH = 60;
    const arrowSize = 14;
    const posX = x;
    const posY = y;

    ctx.beginPath();
    ctx.moveTo(posX + 8, posY);
    ctx.lineTo(posX + rectW, posY);
    ctx.lineTo(posX + rectW + arrowSize, posY + rectH / 2);
    ctx.lineTo(posX + rectW, posY + rectH);
    ctx.lineTo(posX + 8, posY + rectH);
    ctx.quadraticCurveTo(posX, posY + rectH, posX, posY + rectH - 8);
    ctx.lineTo(posX, posY + 8);
    ctx.quadraticCurveTo(posX, posY, posX + 8, posY);
    ctx.closePath();

    ctx.fillStyle = bgColorTag;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, posX + pad, posY + rectH / 2);
    ctx.restore();
  };

  let slotIndex = 0;
  let statsCardPlaced = false;
  let qrCardPlaced = false;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * (cardW + spacingX);
      const y = row * (cardH + spacingY);

      if (!statsCardPlaced && addStatsCard && slotIndex === cardsWithVersion.length) {
        await drawStatsCard(ctx, x, y, cardW, cardH, radius, statsTitle, mainNation, allyNation, deckMap, cardCostMap);
        statsCardPlaced = true;
        slotIndex++;
        continue;
      }
      if (!qrCardPlaced && qrEnabled && slotIndex === cardsWithVersion.length + (addStatsCard ? 1 : 0)) {
        const deckCode = exportDeckCodeFromMap(deckMap, mainNation, allyNation);
        if (deckCode) {
          await drawQrCard(ctx, x, y, cardW, cardH, radius, deckCode, qrTitle);
        }
        qrCardPlaced = true;
        slotIndex++;
        continue;
      }

      const item = slotIndex < cardsWithVersion.length ? cardsWithVersion[slotIndex] : null;
      if (item === null) {
        slotIndex++;
        continue;
      }

      const card = item.card;
      let ver = item.version || DEFAULT_VERSION;
      const count = item.count || 1;

      let img;
      if (card.isCustom && card.imageData) {
        img = await loadImage(card.imageData);
      } else {
        if (!await probeImageExists(card.image, lang, ver)) {
          ver = DEFAULT_VERSION;
        }
        const imgUrl = getCardImageUrl(card.image, lang, ver);
        img = await loadImageWithSharp(imgUrl);
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + cardW - radius, y);
      ctx.quadraticCurveTo(x + cardW, y, x + cardW, y + radius);
      ctx.lineTo(x + cardW, y + cardH - radius);
      ctx.quadraticCurveTo(x + cardW, y + cardH, x + cardW - radius, y + cardH);
      ctx.lineTo(x + radius, y + cardH);
      ctx.quadraticCurveTo(x, y + cardH, x, y + cardH - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.clip();

      if (card.isCustom) {
        const fit = card.imageFit || 'cover';
        const imgAspect = img.width / img.height;
        const cardAspect = cardW / cardH;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (fit === 'cover') {
          if (imgAspect > cardAspect) {
            sh = img.height;
            sw = img.height * cardAspect;
            sx = (img.width - sw) / 2;
          } else {
            sw = img.width;
            sh = img.width / cardAspect;
            sy = (img.height - sh) / 2;
          }
        } else if (fit === 'contain') {
          if (imgAspect < cardAspect) {
            sh = img.height;
            sw = img.height * cardAspect;
            sx = (img.width - sw) / 2;
          } else {
            sw = img.width;
            sh = img.width / cardAspect;
            sy = (img.height - sh) / 2;
          }
        } else {
          sw = img.width;
          sh = img.height;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, cardW, cardH);
      } else {
        ctx.drawImage(img, x, y, cardW, cardH);
      }
      ctx.restore();

      if (count > 1) {
        drawTagWithArrow('×' + (count > 99 ? '99+' : count), x, y + 99 * scaleFactor, '#ffffff');
      }

      if (cardStarMap && cardStarMap.has(card.cardId)) {
        let offset = count > 1 ? 64 : 0;
        drawTagWithArrow('★', x, y + 99 * scaleFactor + offset, '#ffd700');
      }

      slotIndex++;
    }
  }

  return canvas;
}

// ---------- 导出卡组代码 ----------
function exportDeckCodeFromMap(deckMap, mainNation, allyNation) {
  if (deckMap.size === 0) return null;
  const cardCountMap = new Map();
  for (const { card, count } of deckMap.values()) {
    if (card.importId) {
      cardCountMap.set(card.importId, (cardCountMap.get(card.importId) || 0) + count);
    }
  }
  const regions = ["", "", "", ""];
  for (const [importId, totalCount] of cardCountMap.entries()) {
    let remainder = totalCount % 4;
    let quotient = Math.floor(totalCount / 4);
    if (remainder === 0) {
      for (let i = 0; i < quotient; i++) regions[3] += importId;
    } else {
      regions[remainder - 1] += importId;
      for (let i = 0; i < quotient; i++) regions[3] += importId;
    }
  }
  return `%%${getNationCode(mainNation)}${getNationCode(allyNation)}|${regions[0]};${regions[1]};${regions[2]};${regions[3]}`;
}

// ---------- 额外统计图 ----------
async function generateStatsChartCanvas(deckMap, mainNation, allyNation, cardCostMap) {
  const canvas = createCanvas(800, 550);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#1a1c12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c9aa5b";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  const costMap = {};
  for (let i = 0; i <= 7; i++) costMap[i] = { unit: 0, order: 0, counter: 0 };
  let unitTotal = 0, orderTotal = 0, counterTotal = 0;
  let rarityCounts = { Standard: 0, Limited: 0, Special: 0, Elite: 0 };
  let totalCostSum = 0, totalCardsCount = 0;
  let mainCount = 0, allyCount = 0;
  for (const { card, count } of deckMap.values()) {
    if (card.faction === mainNation) mainCount += count;
    else if (card.faction === allyNation) allyCount += count;
    if (rarityCounts.hasOwnProperty(card.rarity)) rarityCounts[card.rarity] += count;
    const effectiveCost = cardCostMap.get(card.cardId) ?? card.cost;
    const cat = effectiveCost >= 7 ? 7 : effectiveCost;
    const typeCat = card.type === "order" ? "order" : card.type === "countermeasure" ? "counter" : "unit";
    if (typeCat === "unit") { costMap[cat].unit += count; unitTotal += count; }
    else if (typeCat === "order") { costMap[cat].order += count; orderTotal += count; }
    else { costMap[cat].counter += count; counterTotal += count; }
    totalCostSum += effectiveCost * count;
    totalCardsCount += count;
  }
  const avgCost = totalCardsCount > 0 ? (totalCostSum / totalCardsCount) : 0;

  ctx.fillStyle = "#ffefbf";
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText("卡组统计", canvas.width/2, 45);

  const iconSize = 28;
  const mainIcon = await loadFactionIcon(mainNation);
  const allyIcon = await loadFactionIcon(allyNation);

  ctx.font = `16px ${FONT_FAMILY}`;
  ctx.textAlign = "left";

  let xPos = 30;
  if (mainIcon) {
    ctx.drawImage(mainIcon, xPos, 62, iconSize, iconSize);
    xPos += iconSize + 5;
  }
  ctx.fillStyle = factionColor[mainNation] || "#c9aa5b";
  ctx.fillText(`${factionNames[mainNation]}: ${mainCount}`, xPos, 83);

  xPos += 140;
  if (allyIcon) {
    ctx.drawImage(allyIcon, xPos, 62, iconSize, iconSize);
    xPos += iconSize + 5;
  }
  ctx.fillStyle = factionColor[allyNation] || "#c9aa5b";
  ctx.fillText(`${factionNames[allyNation]}: ${allyCount}`, xPos, 83);

  ctx.textAlign = "left";
  ctx.font = `15px ${FONT_FAMILY}`;
  ctx.fillStyle = "#e8e4d0";
  ctx.fillText(`单位: ${unitTotal}`, 30, 115);
  ctx.fillStyle = "#f5c542";
  ctx.fillText(`指令: ${orderTotal}`, 160, 115);
  ctx.fillStyle = "#a0a0a0";
  ctx.fillText(`反制: ${counterTotal}`, 290, 115);

  ctx.font = `15px ${FONT_FAMILY}`;
  ctx.fillStyle = "#9e9e9e";
  ctx.fillText(`普通: ${rarityCounts.Standard}`, 30, 145);
  ctx.fillStyle = "#cd7f32";
  ctx.fillText(`限定: ${rarityCounts.Limited}`, 160, 145);
  ctx.fillStyle = "#c0c0c0";
  ctx.fillText(`特殊: ${rarityCounts.Special}`, 290, 145);
  ctx.fillStyle = "#ffd700";
  ctx.fillText(`精英: ${rarityCounts.Elite}`, 420, 145);

  ctx.fillStyle = "#ffefb9";
  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(`平均费用: ${avgCost.toFixed(2)}`, canvas.width/2, 175);

  const barAreaY = 200;
  const barAreaH = 300;
  const barStartX = 50;
  const barWidth = (canvas.width - 100) / 8;
  const barMaxHeight = barAreaH * 0.85;
  const barGap = 4;

  let maxCount = 1;
  for (let i = 0; i <= 7; i++) {
    const total = costMap[i].unit + costMap[i].order + costMap[i].counter;
    if (total > maxCount) maxCount = total;
  }

  for (let i = 0; i <= 7; i++) {
    const bx = barStartX + i * barWidth;
    const unit = costMap[i].unit || 0;
    const order = costMap[i].order || 0;
    const counter = costMap[i].counter || 0;
    const total = unit + order + counter;

    const unitH = maxCount > 0 ? (unit / maxCount) * barMaxHeight : 0;
    const orderH = maxCount > 0 ? (order / maxCount) * barMaxHeight : 0;
    const counterH = maxCount > 0 ? (counter / maxCount) * barMaxHeight : 0;

    let currentY = barAreaY + barAreaH;

    if (unit > 0) {
      ctx.fillStyle = '#e8e4d0';
      ctx.fillRect(bx, currentY - unitH, barWidth - barGap, unitH);
      currentY -= unitH;
    }
    if (order > 0) {
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(bx, currentY - orderH, barWidth - barGap, orderH);
      currentY -= orderH;
    }
    if (counter > 0) {
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(bx, currentY - counterH, barWidth - barGap, counterH);
      currentY -= counterH;
    }

    ctx.fillStyle = "#f5eaca";
    ctx.font = `14px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    const labelY = barAreaY + barAreaH + 22;
    ctx.fillText(i === 7 ? "7K+" : `${i}K`, bx + (barWidth - barGap) / 2, labelY);

    if (total > 0) {
      ctx.fillStyle = "#ffefb9";
      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.fillText(total, bx + (barWidth - barGap) / 2, barAreaY + barAreaH - unitH - orderH - counterH - 5);
    }
  }

  return canvas;
}

// ---------- 主导出函数 ----------
export async function generateDeckImage(deckCode, options = {}) {
  const parsed = parseDeckCode(deckCode);
  const mainNation = parsed.mainFaction;
  const allyNation = parsed.allyFaction;
  const deckMap = new Map();
  for (const { card, count } of parsed.cardEntries) {
    deckMap.set(card.id, { card, count });
  }

  const version = options.version || DEFAULT_VERSION;
  const cols = options.cols || 10;
  const quality = options.quality || 20;
  const lang = options.lang || 'zh-Hans';
  const bgColor = options.bgColor || '#ffffff';
  const addStatsCard = options.addStatsCard !== undefined ? options.addStatsCard : true;
  const foldEnabled = options.foldEnabled !== undefined ? options.foldEnabled : false;
  const qrEnabled = options.qrEnabled !== undefined ? options.qrEnabled : false;
  const statsTitle = options.statsTitle || null;
  const qrTitle = options.qrTitle || null;
  const spacingX = options.spacingX || 0;
  const spacingY = options.spacingY || 0;
  const emptySlots = options.emptySlots || [];
  const hq = options.hq || null;
  const overrides = options.cardOverrides || {};

  let cards = [];

  if (hq) {
    const hqCard = await fetchHeadquarterCard(hq, lang);
    if (hqCard) {
      cards.push({ card: hqCard, version: version, count: 1 });
    }
  }

  const cardCostMap = new Map();
  const cardStarMap = new Map();

  for (const { card, count } of deckMap.values()) {
    const cid = card.cardId;
    const ov = overrides[cid] || {};
    const ver = ov.version || version;
    const cost = ov.cost !== undefined ? ov.cost : card.cost;
    const star = ov.star || false;
    cardCostMap.set(cid, cost);
    if (star) cardStarMap.set(cid, true);
    for (let i = 0; i < count; i++) {
      cards.push({ card, version: ver, count: 1 });
    }
  }

  cards.sort((a, b) => compareCardsForDisplay(a, b, cardCostMap, cardStarMap));

  let finalItems = cards;
  if (foldEnabled) {
    const mergedMap = new Map();
    for (const item of cards) {
      const key = item.card.cardId;
      if (mergedMap.has(key)) {
        mergedMap.get(key).count += 1;
      } else {
        mergedMap.set(key, { ...item, count: 1 });
      }
    }
    finalItems = Array.from(mergedMap.values());
    finalItems.sort((a, b) => compareCardsForDisplay(a, b, cardCostMap, cardStarMap));
  }

  const sortedSlots = [...emptySlots].sort((a, b) => b - a);
  for (const idx of sortedSlots) {
    if (idx >= 0 && idx <= finalItems.length) {
      finalItems.splice(idx, 0, null);
    }
  }

  const mainCanvas = await generateDeckImageWithOptions(
    finalItems,
    {
      cols,
      quality,
      lang,
      addStatsCard,
      bgColor,
      qrEnabled,
      statsTitle,
      qrTitle,
      spacingX,
      spacingY,
      mainNation,
      allyNation,
      deckMap,
      cardCostMap,
      cardStarMap
    }
  );

  const mainBuffer = mainCanvas.toBuffer('image/png');
  const mainBase64 = mainBuffer.toString('base64');

  let statsChartBase64 = null;
  if (options.statsChartToggle) {
    const statsCanvas = await generateStatsChartCanvas(deckMap, mainNation, allyNation, cardCostMap);
    const statsBuffer = statsCanvas.toBuffer('image/png');
    statsChartBase64 = statsBuffer.toString('base64');
  }

  return {
    mainImage: `data:image/png;base64,${mainBase64}`,
    statsChart: statsChartBase64 ? `data:image/png;base64,${statsChartBase64}` : null
  };
}

// ---------- 预加载图标 ----------
export async function preloadIcons() {
  await preloadFactionIcons();
}