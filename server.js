const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let browser = null;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
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
        await page.goto(url, { waitUntil: 'networkidle2' });

        await page.waitForFunction(() => typeof window.generateDeckImageFromCode === 'function');

        const result = await page.evaluate((deckCode, options) => {
            return window.generateDeckImageFromCode(deckCode, options);
        }, deckCode, options);

        await page.close();

        // 返回 JSON 包含主图和统计图（如果有）
        const response = {
            mainImage: result.mainImage, // base64 data URL
        };
        if (result.statsChart) {
            response.statsChart = result.statsChart;
        }
        res.json(response);
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