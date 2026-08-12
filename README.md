# KARDS 军械库 API

基于 Node.js + Canvas 的 KARDS 卡组图片生成服务，由[KARDS 军械库](https://github.com/CraftSoul/kards-image-tool)提供。

## 部署

### Render 一键部署

点击下方按钮跳转 Render：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://railway.com?referralCode=C3GU6z)

### 手动部署

1. 克隆仓库
2. 安装依赖：
```bash
npm install
```

3. 启动服务：

```bash
npm start
```

### 环境要求

· Node.js 18.x

· 系统依赖（Render 已自动安装）：

  · libcairo2-dev
  
  · libjpeg-dev
  
  · libpango1.0-dev
  
  · libgif-dev
  
  · build-essential

## API

### 接口
```
https://kapi-v7wl.onrender.com/generate
```

生成卡组图片

端点： POST /generate

### 请求头

```
Content-Type: application/json
```

### 请求体

| 参数 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| deckCode | string | - | 必填，KARDS卡组代码 |
| version | string | `DEFAULT_VERSION` | 卡牌版本 |
| cols | number | 10 | 每行卡牌数量 |
| scale | number | 100 | 缩放比例(25-100) |
| lang | string | zh-Hans | 语言代码 |
| bgColor| string | transparent | 背景颜色(十六进制颜色码) |
| addStatsCard | boolean | true | 统计卡 |
| foldEnabled | boolean | false | 折叠重复卡牌 |
| qrEnabled | boolean | false | 二维码卡 |
| statsTitle | string | 卡组统计 | 统计卡标题 |
| qrTitle | string | 卡组二维码 | 二维码卡标题 |
| spacingX | number | 0 | 水平间距 |
| spacingY | number | 0 | 垂直间距 |
| emptySlots | array | [] | 空位索引数组 |
| hq | string | - | 总部cardId(如`moscow`) |
| statsChartToggle | boolean | false | 是否生成额外统计图 |
| cardOverrides | object | {} | 单卡覆盖配置 |

#### `cardOverrides` 格式：

```json
{
  "cardId": {
    "version": "v52",
    "cost": 3,
    "star": true
  }
}
```
#### 语言代码

| 代码 | 语言 |
| --- | --- |
| zh-Hans | 简体中文 |
| zh-Hant | 繁体中文 |
| en-EN | English |
| fr-FR | Français |
| de-DE | Deutsch |
| pl-PL | Polski |
| pt-BR | Português |
| ru-RU | Pусский |
| it-IT | Italiano |
| es-ES | Español |
| ko-KR | 한국어 |
| ja-JP | 日本語 |

### 响应格式

```json
{
  "mainImage": "data:image/png;base64,...",
  "statsChart": "data:image/png;base64,..."
}
```

| 字段 | 描述 |
| --- | --- |
| mainImage | 卡组图片(Base64) |
| statsChart | 额外统计图(仅当 `statsChartToggle: true` 时返回) |

### 错误响应

```json
{
  "error": "错误描述"
}
```

### 示例

#### cURL

```bash
curl -X POST https://your-service.onrender.com/generate \
  -H "Content-Type: application/json" \
  -d '{
    "deckCode": "%%15|;;bK;bKbKbKbKbKbKbKbKbK",
    "cols": 8,
    "lang": "zh-Hans"
  }'
```

#### JavaScript (Node.js)

```javascript
import fs from 'fs';

const response = await fetch('https://your-service.onrender.com/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deckCode: '%%15|;;bK;bKbKbKbKbKbKbKbKbK',
    cols: 8,
    lang: 'zh-Hans'
  })
});

const data = await response.json();
// 提取 Base64 数据
const base64Data = data.mainImage.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync('deck.png', Buffer.from(base64Data, 'base64'));
```

#### Python

```python
import requests
import base64

response = requests.post('https://your-service.onrender.com/generate', json={
    'deckCode': '%%15|;;bK;bKbKbKbKbKbKbKbKbK',
    'cols': 8,
    'lang': 'zh-Hans'
})

data = response.json()
base64_data = data['mainImage'].split(',')[1]
with open('deck.png', 'wb') as f:
    f.write(base64.b64decode(base64_data))
```

## 文件结构

```
├── server.js          # 服务入口
├── deckRenderer.js    # 核心渲染逻辑
├── cardData.js        # 卡牌数据加载
├── package.json       # 项目配置
├── render.yaml        # Render 部署配置
├── font.ttf           # 中文字体文件
├── data.json          # 卡牌数据库
├── germany.svg        # 阵营图标
├── britain.svg
└── ...
```

## 跨域Weserv代理版

使用`wsrv.nl`代理卡图避免跨域问题，如果服务器在国内。

### 文件替换

使用`weserv`目录下的文件替换：
```
├── deckRenderer.js
├── package.json
└── render.yaml
```

### 额外参数

| 参数 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| quality | number | 20 | 图片质量(1-100) |

控制Weserv的画质参数

## 注意事项

1. 卡牌数据：需同步更新`data.json`
2. 阵营图标：`{faction}.svg` 文件
3. 部署环境：本API使用 Render 免费计划，启动速度快如故障机器人

## 许可

MIT
