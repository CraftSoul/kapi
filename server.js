import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

// 确保浏览器已下载
async function ensureBrowserInstalled() {
    const cacheDir = path.join(__dirname, '.cache', 'puppeteer');
    const chromePath = path.join(cacheDir, 'chrome', 'linux-121.0.6167.85', 'chrome-linux64', 'chrome');
    
    // 检查浏览器是否存在
    if (!fs.existsSync(chromePath)) {
        console.log('⚠️ 未找到 Chrome，正在下载...');
        try {
            // 执行安装命令
            execSync('npx puppeteer browsers install chrome', {
                stdio: 'inherit',
                cwd: __dirname
            });
            console.log('✅ Chrome 下载完成');
        } catch (error) {
            console.error('❌ Chrome 下载失败:', error.message);
            throw error;
        }
    } else {
        console.log('✅ Chrome 已存在:', chromePath);
    }
}

async function getBrowser() {
    if (!browser) {
        // 确保浏览器已安装
        await ensureBrowserInstalled();
        
        console.log('启动 Puppeteer...');
        try {
            browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                headless: true,
                // 指定缓存目录
                userDataDir: path.join(__dirname, '.cache', 'puppeteer', 'user-data')
            });
            console.log('✅ 浏览器启动成功');
        } catch (error) {
            console.error('❌ 浏览器启动失败:', error.message);
            throw error;
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
});

process.on('SIGINT', async () => {
    console.log('正在关闭...');
    if (browser) await browser.close();
    server.close(() => process.exit(0));
});