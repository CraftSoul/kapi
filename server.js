import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

// 下载静态 Chrome
async function downloadStaticChrome() {
    const chromeDir = path.join(__dirname, '.chrome');
    const chromePath = path.join(chromeDir, 'chrome-linux', 'chrome');
    
    if (fs.existsSync(chromePath)) {
        console.log('✅ 静态 Chrome 已存在');
        return chromePath;
    }
    
    console.log('📥 下载静态 Chrome...');
    fs.mkdirSync(chromeDir, { recursive: true });
    
    // 使用 Chromium 静态构建（包含所有依赖）
    const url = 'https://github.com/ungoogled-software/ungoogled-chromium-binaries/releases/download/121.0.6167.85-1/ungoogled-chromium_121.0.6167.85-1_linux.tar.xz';
    
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path.join(chromeDir, 'chrome.tar.xz'));
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('📦 解压 Chrome...');
                execSync(`tar -xf ${path.join(chromeDir, 'chrome.tar.xz')} -C ${chromeDir}`, { stdio: 'inherit' });
                fs.unlinkSync(path.join(chromeDir, 'chrome.tar.xz'));
                console.log('✅ 静态 Chrome 准备完成');
                resolve(chromePath);
            });
        }).on('error', reject);
    });
}

async function getBrowser() {
    if (!browser) {
        console.log('🚀 准备浏览器...');
        
        // 先尝试使用 Nix 安装的 Chromium
        const nixPaths = [
            '/nix/store/*-chromium/bin/chromium',
            '/nix/store/*-chromium/bin/chromium-browser'
        ];
        
        let executablePath = null;
        
        // 检查 Nix 路径
        try {
            const glob = await import('glob');
            for (const pattern of nixPaths) {
                const matches = await glob.glob(pattern);
                if (matches && matches.length > 0) {
                    executablePath = matches[0];
                    console.log(`✅ 找到 Nix Chromium: ${executablePath}`);
                    break;
                }
            }
        } catch (e) {}
        
        // 如果 Nix 没有，使用静态 Chrome
        if (!executablePath) {
            executablePath = await downloadStaticChrome();
        }
        
        console.log(`🚀 启动 Puppeteer (${executablePath})...`);
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
                headless: 'new',
                timeout: 60000
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