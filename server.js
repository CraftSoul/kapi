import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

async function getBrowser() {
    if (!browser) {
        console.log('启动 Puppeteer...');
        // const config = await import('./puppeteer.config.cjs');
        // const cacheDir = config.default.cacheDirectory;
        
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
            headless: true,
            // 不强制指定 executablePath，让 puppeteer 根据配置和缓存自动寻找
        });
        console.log('✅ 浏览器启动成功');
    }
    return browser;
}

app.post('/generate', async (req, res) => {
    const { deckCode, ...options } = req.body;
    if (!deckCode) {
        return res.status(400).json({ error: 'Missing deckCode' });
    }

    try {
        const browserInstance = await getBrowser();
        const page = await browserInstance.newPage();
        
        const url = `http://localhost:${port}/render.html`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.waitForFunction(() => typeof window.generateDeckImageFromCode === 'function', { timeout: 30000 });

        const result = await page.evaluate((deckCode, options) => {
            return window.generateDeckImageFromCode(deckCode, options);
        }, deckCode, options);

        await page.close();

        res.json({
            mainImage: result.mainImage,
            statsChart: result.statsChart || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

process.on('SIGINT', async () => {
    if (browser) await browser.close();
    server.close(() => process.exit(0));
});