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

// 强制下载浏览器
async function ensureBrowserInstalled() {
    const cacheDir = path.join(__dirname, '.cache', 'puppeteer');
    const chromeMarker = path.join(cacheDir, '.installed');
    
    // 检查是否已经下载过
    if (fs.existsSync(chromeMarker)) {
        console.log('✅ 浏览器已安装 (标记文件存在)');
        return;
    }
    
    console.log('⚠️ 未找到浏览器，开始下载...');
    console.log(`📁 缓存目录: ${cacheDir}`);
    
    // 确保目录存在
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    try {
        // 方法1: 使用 npx 安装
        console.log('🔄 尝试通过 npx 安装...');
        execSync('npx puppeteer browsers install chrome', {
            stdio: 'inherit',
            cwd: __dirname,
            env: {
                ...process.env,
                PUPPETEER_CACHE_DIR: cacheDir
            }
        });
        
        // 创建标记文件
        fs.writeFileSync(chromeMarker, Date.now().toString());
        console.log('✅ 浏览器安装成功');
        
    } catch (error) {
        console.error('❌ npx 安装失败:', error.message);
        
        // 方法2: 尝试使用 puppeteer 内置的安装
        try {
            console.log('🔄 尝试通过 Puppeteer 内置方法安装...');
            const puppeteerPkg = await import('puppeteer/package.json');
            const version = puppeteerPkg.default.version;
            console.log(`Puppeteer 版本: ${version}`);
            
            // 直接调用 puppeteer 的安装脚本
            execSync(`node node_modules/puppeteer/install.js`, {
                stdio: 'inherit',
                cwd: __dirname,
                env: {
                    ...process.env,
                    PUPPETEER_CACHE_DIR: cacheDir
                }
            });
            
            fs.writeFileSync(chromeMarker, Date.now().toString());
            console.log('✅ 浏览器安装成功 (通过 install.js)');
            
        } catch (error2) {
            console.error('❌ 所有安装方法都失败了:', error2.message);
            throw new Error(`无法安装浏览器: ${error2.message}`);
        }
    }
    
    // 验证安装
    const possiblePaths = [
        path.join(cacheDir, 'chrome', 'linux-*', 'chrome-linux64', 'chrome'),
        path.join(cacheDir, 'chrome', 'linux-*', 'chrome-linux', 'chrome'),
        path.join(process.env.HOME || '/root', '.cache', 'puppeteer', 'chrome', 'linux-*', 'chrome-linux64', 'chrome')
    ];
    
    let found = false;
    for (const pattern of possiblePaths) {
        try {
            const glob = await import('glob');
            const matches = await glob.glob(pattern);
            if (matches && matches.length > 0) {
                console.log(`✅ 找到浏览器: ${matches[0]}`);
                found = true;
                break;
            }
        } catch (e) {
            // 继续尝试
        }
    }
    
    if (!found) {
        console.log('⚠️ 未能验证浏览器安装，但将继续尝试启动...');
    }
}

async function getBrowser() {
    if (!browser) {
        try {
            // 确保浏览器已安装
            await ensureBrowserInstalled();
            
            console.log('🚀 启动 Puppeteer...');
            
            // 尝试多种启动方式
            let launchOptions = {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                headless: 'new', // 使用新 Headless 模式
                timeout: 60000
            };
            
            // 尝试使用环境变量指定的路径
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                console.log(`📌 使用指定路径: ${launchOptions.executablePath}`);
            }
            
            try {
                browser = await puppeteer.launch(launchOptions);
                console.log('✅ 浏览器启动成功');
            } catch (launchError) {
                console.error('❌ 首次启动失败:', launchError.message);
                
                // 如果启动失败，尝试不指定路径，让 Puppeteer 自动查找
                console.log('🔄 尝试让 Puppeteer 自动查找浏览器...');
                delete launchOptions.executablePath;
                browser = await puppeteer.launch(launchOptions);
                console.log('✅ 浏览器启动成功 (自动查找)');
            }
            
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