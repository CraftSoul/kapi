// puppeteer.config.cjs
const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // 关键：将浏览器缓存目录设置在项目目录内，避免权限问题
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};