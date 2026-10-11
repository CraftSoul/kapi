# KARDS 军械库 API | KARDS Arsenal API

基于 Node.js + Canvas 的 KARDS 卡组图片生成服务，由[KARDS 军械库](https://github.com/CraftSoul/kards-image-tool)提供。

**KARDS** deck image generation service based on Node.js + Canvas. Provided by [KARDS Arsenal](https://github.com/CraftSoul/kards-image-tool).

## 声明 Statement

本项目遵循1939 Games的 [**"Community content policy"(社区内容政策)**](https://support.kards.com/hc/en-us/articles/360027838532-KARDS-Community-License) ，使用[**1939 Games**](https://www.1939games.com/) 拥有的资产。1939 Games 并未直接支持或赞助本项目。所有卡牌图像版权归 1939 Games 所有，本项目仅作非商业学习与工具用途。

**KAPI** was created under 1939 Games' ["Community content policy"](https://support.kards.com/hc/en-us/articles/360027838532-KARDS-Community-License) using assets owned by [1939 Games](https://www.1939games.com/). 1939 Games does not endorse or sponsor this project. All card images are copyrighted by 1939 Games, and this project is for non-commercial learning and tool purposes.

## /health 健康检查

```
https://karsenal-api.netlify.app/.netlify/functions/health
```

Method：`GET`

检查土豆是否成熟

Check if the service is alive.

### 响应格式 Response Format

```json
{
  "status": "ok",
  "timestamp": "2026-09-25T11:30:00.000Z",
  "uptime": 12.34
}
```

### 示例 Example

```bash
curl https://karsenal-api.netlify.app/.netlify/functions/health
```

## /generate 卡组图片生成

```
https://karsenal-api.netlify.app/.netlify/functions/generate
```

Method：`POST`

生成KARDS卡组图片

Generate KARDS deck images.

### 请求头 Request Header

```
Content-Type: application/json
```

### 请求体 Request Body

**基础 Base**
| 参数 Item | 类型 Type | 默认值 Default | 描述 Description |
| --- | :---: | :---: | --- |
| **deckCode** | string | - | **必填**，KARDS卡组代码 **Required**,KARDS deck code |
| cols | number | 10 | 每行卡牌数量 Number of cards per row |
| scale | number | 50 | 缩放比例(25-100)  Image scale |
| lang | string | zh-Hans | 语言代码 Language code |
| bgColor | string | transparent | 背景颜色(十六进制颜色码) Background color(Hexadecimal color code) |

**附件 Attachment**
| 参数 Item | 类型 Type | 默认值 Default | 描述 Description |
| --- | :---: | :---: | --- |
| foldEnabled | boolean | false | 折叠重复卡牌 Fold same cards |
| addStatsCard | boolean | true | 统计卡 Statistical Card|
| statsTitle | string | 卡组统计 | 统计卡标题 Statistical Card title |
| qrEnabled | boolean | false | 二维码卡 QR code card |
| qrTitle | string | 卡组二维码 | 二维码卡标题 QR code card title |
| hq | string | - | 总部cardId(如`moscow`) HQ cardId |
| statsChartToggle | boolean | false | 额外统计图 Additional statistical chart |

**高级 Advanced**
| 参数 Item | 类型 Type | 默认值 Default | 描述 Description |
| --- | :---: | :---: | --- |
| version | string | `DEFAULT_VERSION` | 卡牌版本 Card version |
| spacingX | number | 0 | 水平间距 Horizontal spacing |
| spacingY | number | 0 | 垂直间距 Vertical spacing |
| emptySlots | array | [] | 空位索引数组 Vacancy index array |
| cardOverrides | object | {} | 单卡覆盖配置 Single-card coverage settings|

#### `cardOverrides` 格式 Format

```json
{
  "cardId": {
    "version": "v52",
    "cost": 3,
    "star": true
  }
}
```
#### 语言代码 Language Code

| 代码 Code | 语言 Lang |
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

### 响应格式 Response Format

```json
{
  "mainImage": "data:image/png;base64,...",
  "statsChart": "data:image/png;base64,..."
}
```

| 字段 Field | 描述 Description |
| --- | --- |
| mainImage | 卡组图片(Base64) Deck image(Base64) |
| statsChart | 额外统计图(仅当 `statsChartToggle: true` 时返回) Additional statistical chart(return if `statsChartToggle: true`) |

### 错误响应 Error Response

```json
{
  "error": "错误描述 Error Description"
}
```

### 示例 Example

#### cURL

```bash
curl -X POST https://karsenal-api.netlify.app/.netlify/functions/generate \
  -H "Content-Type: application/json" \
  -d '{
    "deckCode": "%%5a|jvpy;j3xAyc;czydj1bPmI;ggbKpEy6",
    "cols": 8,
    "lang": "zh-Hans"
  }'
```

#### JavaScript (Node.js)

```javascript
import fs from 'fs';

const response = await fetch('https://karsenal-api.netlify.app/.netlify/functions/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deckCode: '%%5a|jvpy;j3xAyc;czydj1bPmI;ggbKpEy6',
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

response = requests.post('https://karsenal-api.netlify.app/.netlify/functions/generate', json={
    'deckCode': '%%5a|jvpy;j3xAyc;czydj1bPmI;ggbKpEy6',
    'cols': 8,
    'lang': 'zh-Hans'
})

data = response.json()
base64_data = data['mainImage'].split(',')[1]
with open('deck.png', 'wb') as f:
    f.write(base64.b64decode(base64_data))
```

## /deck-json 卡组JSON

```
https://karsenal-api.netlify.app/.netlify/functions/deck-json
```

Method：`GET/POST`

解析卡组并返回格式化卡牌数据

Parse the deck and return formatted card data.

### 请求头 Request Header

```
Content-Type: application/json
```

### 请求体 Request Body

| 参数 Item | 类型 Type | 默认值 Default | 描述 Description |
| --- | :---: | :---: | --- |
| deckCode | string | - | KARDS卡组代码 KARDS deck code |

### 响应格式 Response Format

```json
{
  "mainFaction": "usa",
  "allyFaction": "anzac",
  "mainFactionName": "美国",
  "allyFactionName": "澳新军团",
  "totalCards": 39,
  "uniqueCards": 14,
  "cards": [
    {
      "count": 4,
      "card": {
        "id": 93750,
        "cardId": "the_war_machine",
        "importId": "bK",
        "titleZh": "战争机器",
        "titleEn": "THE WAR MACHINE",
        "text_zh": "额外获得 1 个指挥点槽。",
        "textMap": {
          "zh-Hans": "额外获得 1 个指挥点槽。",
          "zh-Hant": "額外獲得 1 個指揮點槽。",
          …
        },
        "titleMap": {
          "zh-Hans": "战争机器",
          "zh-Hant": "戰爭機器",
          …
        },
        "faction": "usa",
        "type": "order",
        "rarity": "Standard",
        "cost": 2,
        "attributes": [],
        "setName": "Base",
        "image": "the_war_machine.avif",
        "reserved": false,
        "isSpawn": false,
        "isVeteranSet": false,
        "canCreate": []
      }
    },
    …
  ]
}
```

### 示例 Example

```bash
curl -X POST https://karsenal-api.netlify.app/.netlify/functions/deck-json \
  -H "Content-Type: application/json" \
  -d '{"deckCode":"%%5a|jvpy;j3xAyc;czydj1bPmI;ggbKpEy6"}'
```

## 许可 License

MIT
