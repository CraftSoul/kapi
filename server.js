const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

async function getBrowser() {
    if (!browser) {
        try {
            // 尝试使用 puppeteer 自带浏览器
            browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                headless: true
            });
        } catch (err) {
            console.log('使用默认 Chromium 失败，尝试指定路径...');
            
            // 方案2: 尝试常见的 Chromium 安装路径
            const possiblePaths = [
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/lib/chromium-browser/chromium-browser',
                '/usr/lib/chromium/chromium',
                '/usr/lib/chromium-browser/chromium',
                // Puppeteer 下载路径
                path.join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium', 'linux-*', 'chrome-linux', 'chrome'),
                path.join(process.cwd(), 'node_modules', 'puppeteer-core', '.local-chromium', 'linux-*', 'chrome-linux', 'chrome'),
                path.join(process.cwd(), '.local-chromium', 'linux-*', 'chrome-linux', 'chrome'),
            ];
            
            let executablePath = null;
            for (const p of possiblePaths) {
                // 通配符处理
                if (p.includes('*')) {
                    const glob = require('glob');
                    const matches = await new Promise((resolve) => {
                        glob(p, (err, files) => {
                            if (err || !files || files.length === 0) resolve([]);
                            else resolve(files);
                        });
                    });
                    if (matches && matches.length > 0) {
                        executablePath = matches[0];
                        break;
                    }
                } else {
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(p)) {
                            executablePath = p;
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            if (executablePath) {
                console.log(`使用 Chromium: ${executablePath}`);
                browser = await puppeteer.launch({
                    executablePath: executablePath,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage'
                    ],
                    headless: true
                });
            } else {
                throw new Error('无法找到 Chromium 可执行文件');
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
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.waitForFunction(() => typeof window.generateDeckImageFromCode === 'function', { timeout: 30000 });

        const result = await page.evaluate((deckCode, options) => {
            return window.generateDeckImageFromCode(deckCode, options);
        }, deckCode, options);

        await page.close();

        const response = {
            mainImage: result.mainImage,
        };
        if (result.statsChart) {
            response.statsChart = result.statsChart;
        }
        res.json(response);
    } catch (err) {
        console.error('Error:', err);
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