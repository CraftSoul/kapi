import express from 'express';
import { generateDeckImage, preloadIcons } from './deckRenderer.js';

const app = express();
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

// 启动服务器
app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  // 预加载阵营图标
  await preloadIcons();
  console.log('✅ 所有阵营图标已缓存');
});