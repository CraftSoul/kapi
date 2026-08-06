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

// 获取 Puppeteer 自带 Chromium 的路径
function getPuppeteerChromiumPath() {
    // Puppeteer 21.x 的默认安装路径
    const possiblePaths = [
        // 新版 puppeteer (v21+) 路径
        path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium', 'linux-*', 'chrome-linux64', 'chrome'),
        path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium', 'linux-*', 'chrome-linux', 'chrome'),
        // 旧版 puppeteer 路径
        path.join(__dirname, 'node_modules', 'puppeteer-core', '.local-chromium', 'linux-*', 'chrome-linux64', 'chrome'),
        path.join(__dirname, 'node_modules', 'puppeteer-core', '.local-chromium', 'linux-*', 'chrome-linux', 'chrome'),
        // 用户缓存路径（如果 postinstall 下载到了这里）
        path.join(process.env.HOME || '/root', '.cache', 'puppeteer', 'chrome', 'linux-*', 'chrome-linux64', 'chrome'),
    ];

    for (const pattern of possiblePaths) {
        try {
            // 使用 glob 匹配通配符
            const glob = require('glob');
            const matches = glob.sync(pattern);
            if (matches && matches.length > 0) {
                // 按修改时间排序，取最新的
                const sorted = matches.sort((a, b) => {
                    return fs.statSync(b).mtime - fs.statSync(a).mtime;
                });
                const found = sorted[0];
                if (fs.existsSync(found)) {
                    console.log(`✅ 找到自带的 Chromium: ${found}`);
                    return found;
                }
            }
        } catch (e) {
            // 忽略 glob 错误
        }
    }

    return null;
}

async function getBrowser() {
    if (!browser) {
        console.log('🚀 启动 Puppeteer...');

        // 1. 先尝试使用 Puppeteer 自带的 Chromium
        let chromiumPath = getPuppeteerChromiumPath();

        // 2. 如果没找到，尝试让 Puppeteer 自动下载（但指定缓存到 node_modules 内）
        if (!chromiumPath) {
            console.log('⚠️ 未找到自带的 Chromium，尝试强制下载...');
            try {
                // 强制下载到 node_modules 内
                const cacheDir = path.join(__dirname, 'node_modules', '.puppeteer-cache');
                if (!fs.existsSync(cacheDir)) {
                    fs.mkdirSync(cacheDir, { recursive: true });
                }

                execSync('npx puppeteer browsers install chrome', {
                    stdio: 'inherit',
                    cwd: __dirname,
                    env: {
                        ...process.env,
                        PUPPETEER_CACHE_DIR: cacheDir
                    }
                });

                // 重新查找
                chromiumPath = getPuppeteerChromiumPath();
                if (!chromiumPath) {
                    // 在自定义缓存目录中查找
                    const customPath = path.join(cacheDir, 'chrome', 'linux-*', 'chrome-linux64', 'chrome');
                    const glob = require('glob');
                    const matches = glob.sync(customPath);
                    if (matches && matches.length > 0) {
                        chromiumPath = matches[0];
                    }
                }

                if (chromiumPath) {
                    console.log(`✅ 下载后找到 Chromium: ${chromiumPath}`);
                }
            } catch (error) {
                console.error('❌ 自动下载失败:', error.message);
            }
        }

        // 3. 启动浏览器
        try {
            const launchOptions = {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                headless: 'new',
                timeout: 60000
            };

            // 如果找到了 Chromium 路径，显式指定
            if (chromiumPath) {
                launchOptions.executablePath = chromiumPath;
                console.log(`📌 使用 Chromium: ${chromiumPath}`);
            } else {
                // 如果没找到，让 Puppeteer 自己尝试（可能会从缓存中找）
                console.log('📌 让 Puppeteer 自动查找浏览器');
            }

            browser = await puppeteer.launch(launchOptions);
            console.log('✅ 浏览器启动成功');
        } catch (error) {
            console.error('❌ 浏览器启动失败:', error.message);

            // 如果启动失败，尝试最后一次：使用系统默认
            console.log('🔄 尝试使用系统默认浏览器...');
            try {
                browser = await puppeteer.launch({
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                    headless: 'new',
                    timeout: 60000
                });
                console.log('✅ 系统默认浏览器启动成功');
            } catch (finalError) {
                console.error('❌ 所有启动方式都失败:', finalError.message);
                throw new Error(`无法启动浏览器: ${finalError.message}`);
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