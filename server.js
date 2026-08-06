import express from 'express';
import { generateDeckImage, preloadIcons } from './deckRenderer.js';
import { registerFont } from 'canvas';
import path from 'path';

try {
  registerFont(path.join(__dirname, 'fonts', 'NotoSansSC-Regular.ttf'), { family: 'Noto Sans SC' });
  registerFont(path.join(__dirname, 'fonts', 'NotoSansSC-Bold.ttf'), { family: 'Noto Sans SC', weight: 'bold' });
} catch (e) {
  console.warn('中文字体注册失败，将使用后备字体', e.message);
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