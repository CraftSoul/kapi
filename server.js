import express from 'express';
import { generateDeckImage, preloadIcons } from './deckRenderer.js';
import { registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

// 定义 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 注册字体
try {
  registerFont(path.join(__dirname, 'font.ttf'), { family: 'CustomFont' });
  console.log('✅ 字体注册成功');
} catch (e) {
  console.warn('字体注册失败:', e.message);
}

const app = express();

// 启用 CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

app.post('/generate', async (req, res) => {
  const { deckCode, ...options } = req.body;
  if (!deckCode) {
    return res.status(400).json({ error: 'Missing deckCode' });
  }

  try {
    const result = await generateDeckImage(deckCode, options);
    res.json(result);
  } catch (err) {
    console.error('生成失败:', err);
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  await preloadIcons();
  console.log('✅ 所有阵营图标已缓存');
});