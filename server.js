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

// 核心函数：强制确保浏览器已下载
async function ensureBrowserInstalled() {
    const cacheDir = path.join(__dirname, '.cache', 'puppeteer');
    console.log(`📁 缓存目录: ${cacheDir}`);

    // 1. 检查是否已存在
    const possiblePaths = [
        path.join(cacheDir, 'chrome', 'linux-121.0.6167.85', 'chrome-linux64', 'chrome'),
        path.join(cacheDir, 'chrome', 'linux-*', 'chrome-linux64', 'chrome'),
        path.join(cacheDir, 'chrome', 'linux-*', 'chrome-linux', 'chrome'),
    ];

    for (const p of possiblePaths) {
        try {
            // 处理通配符
            if (p.includes('*')) {
                const glob = await import('glob');
                const matches = await glob.glob(p);
                if (matches && matches.length > 0) {
                    const found = matches[0];
                    console.log(`✅ 找到浏览器: ${found}`);
                    // 设置环境变量，让 puppeteer.launch 能直接使用
                    process.env.PUPPETEER_EXECUTABLE_PATH = found;
                    return;
                }
            } else {
                if (fs.existsSync(p)) {
                    console.log(`✅ 找到浏览器: ${p}`);
                    process.env.PUPPETEER_EXECUTABLE_PATH = p;
                    return;
                }
            }
        } catch (e) { /* 忽略查找错误 */ }
    }

    // 2. 如果没找到，强制下载
    console.log('⚠️ 未找到浏览器，开始下载...');
    try {
        // 明确设置缓存目录并执行安装
        execSync('npx puppeteer browsers install chrome', {
            stdio: 'inherit',
            cwd: __dirname,
            env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir }
        });
        console.log('✅ 下载命令执行完成');

        // 下载后再次查找（通常在 linux-* 目录下）
        const newSearchPath = path.join(cacheDir, 'chrome', 'linux-*', 'chrome-linux64', 'chrome');
        const glob = await import('glob');
        const matches = await glob.glob(newSearchPath);
        if (matches && matches.length > 0) {
            const found = matches[0];
            console.log(`✅ 下载后找到浏览器: ${found}`);
            process.env.PUPPETEER_EXECUTABLE_PATH = found;
            return;
        }
        throw new Error('下载后仍未找到浏览器可执行文件');
    } catch (error) {
        console.error('❌ 浏览器下载或查找失败:', error.message);
        throw new Error(`无法准备浏览器环境: ${error.message}`);
    }
}

async function getBrowser() {
    if (!browser) {
        console.log('🚀 准备浏览器环境...');
        await ensureBrowserInstalled(); // 确保下载

        console.log('🚀 启动 Puppeteer...');
        try {
            browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                headless: 'new',
                timeout: 60000
                // 注意：不传 executablePath，让 puppeteer 从环境变量或缓存中读取
            });
            console.log('✅ 浏览器启动成功');
        } catch (error) {
            console.error('❌ 浏览器启动失败:', error.message);
            throw new Error(`无法启动浏览器: ${error.message}`);
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
        
        // 设置更长的超时
        page.setDefaultTimeout(120000);
        
        const url = `http://localhost:${port}/render.html`;
        console.log('📄 加载页面:', url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.waitForFunction(() => typeof window.generateDeckImageFromCode === 'function', { timeout: 30000 });

        console.log('🎨 开始生成图片...');
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
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📁 工作目录: ${__dirname}`);
    console.log(`🔧 Node 版本: ${process.version}`);
});

process.on('SIGINT', async () => {
    console.log('🛑 正在关闭...');
    if (browser) await browser.close();
    server.close(() => process.exit(0));
});