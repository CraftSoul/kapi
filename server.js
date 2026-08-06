import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

async function getBrowser() {
    if (!browser) {
        console.log('启动 Puppeteer...');
        
        // 尝试多个可能的 Chromium 路径
        const possiblePaths = [
            process.env.PUPPETEER_EXECUTABLE_PATH,
            process.env.CHROME_PATH,
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome'
        ].filter(Boolean);
        
        let executablePath = null;
        for (const p of possiblePaths) {
            try {
                if (fs.existsSync(p)) {
                    executablePath = p;
                    console.log(`✅ 找到浏览器: ${p}`);
                    break;
                }
            } catch (e) {}
        }
        
        if (!executablePath) {
            console.log('⚠️ 未找到系统浏览器，尝试让 Puppeteer 自动下载...');
            // 如果找不到系统浏览器，回退到 Puppeteer 自动下载
            try {
                browser = await puppeteer.launch({
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu'
                    ],
                    headless: true
                });
                console.log('✅ Puppeteer 自动下载并启动成功');
                return browser;
            } catch (e) {
                throw new Error(`无法找到浏览器: ${e.message}`);
            }
        }
        
        try {
            browser = await puppeteer.launch({
                executablePath: executablePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                headless: true
            });
            console.log('✅ 浏览器启动成功');
        } catch (error) {
            console.error('❌ 浏览器启动失败:', error.message);
            // 如果使用系统浏览器失败，尝试自动下载
            try {
                console.log('🔄 尝试使用 Puppeteer 自动下载...');
                browser = await puppeteer.launch({
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu'
                    ],
                    headless: true
                });
                console.log('✅ Puppeteer 自动下载并启动成功');
            } catch (e) {
                throw error;
            }
        }
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
        console.log('加载页面:', url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.waitForFunction(() => typeof window.generateDeckImageFromCode === 'function', { timeout: 30000 });

        console.log('开始生成图片...');
        const result = await page.evaluate((deckCode, options) => {
            return window.generateDeckImageFromCode(deckCode, options);
        }, deckCode, options);

        await page.close();
        console.log('✅ 图片生成完成');

        res.json({
            mainImage: result.mainImage,
            statsChart: result.statsChart || null
        });
    } catch (err) {
        console.error('❌ 请求处理失败:', err);
        res.status(500).json({ error: err.message });
    }
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`工作目录: ${__dirname}`);
    console.log(`环境变量 PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || '未设置'}`);
});

process.on('SIGINT', async () => {
    console.log('正在关闭...');
    if (browser) await browser.close();
    server.close(() => process.exit(0));
});