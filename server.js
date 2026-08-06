const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

async function getBrowser() {
    if (!browser) {
        // 获取 Chrome 可执行路径（Render 环境）
        const chromePath = process.env.CHROME_PATH || 
                          await puppeteer.executablePath('chrome');
        
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ],
            executablePath: chromePath,
            headless: 'new'
        });
    }
    return browser;
}

// 其余路由代码保持不变...
// 注意：PORT 由 Render 环境变量提供
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// 优雅关闭
process.on('SIGINT', async () => {
    if (browser) await browser.close();
    server.close(() => process.exit(0));
});