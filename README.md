# Map Generate Demo

岛屿地图程序化生成器项目，采用 monorepo 结构，包含多个独立实现。

## 仓库构成

```
map-generate-demo/
├── python-map-generator/       # Python 版本（Flask + HTML）
├── web-map-generator/          # Web 版本（纯 HTML/JS）
└── web-map-viewer/             # Web 地图查看器（预留）
```

---

## 1. python-map-generator

> Python 版本，带有 Flask Web 界面
>
> Prototype by Nate

**技术栈**：Python + Flask + HTML/CSS/JS

### 核心算法

#### 岛屿生成 - 链式生长算法

- **链式连接**：岛屿按顺序生成，后一个岛屿从前一个岛屿边缘生长，通过 Bresenham 直线算法连接
- **噪声多边形**：使用平滑漂移噪声沿圆周变化半径，生成自然的岛屿轮廓
- **连通保证**：所有岛屿通过桥梁相连，形成单一连通陆地块

#### 环境生成 - 多种子洪水填充

- **多种子扩散**：随机选择未分配单元格作为种子，扩展环境区域直到自然停止
- **受控随机性**：切换概率 = 基础概率 + (区域增长 × 增长系数) - (内聚度 × 内聚偏差)
- **邻近偏差**：邻居中相同环境的数量会提升该环境的选中概率，使环境分布更集中

### 快速开始

```bash
cd python-map-generator
pip install -r requirements.txt
python app.py
# 浏览器打开 http://localhost:5000
```

---

## 2. web-map-generator

> 纯 HTML/CSS/JS 实现，无需服务器
>
> Prototype by David & Huang Saša

**技术栈**：原生 HTML + CSS + JavaScript（模块化架构）

### 目录结构

```
web-map-generator/v2/
├── index.html      # 主页面（UI 布局和控件）
├── index.js        # 入口文件（初始化应用）
├── style.css       # 样式表（深色主题）
└── js/
    ├── generator.js    # 核心生成逻辑
    │   ├── TERRAIN 地形类型枚举
    │   ├── ISLAND/ POLY/ FEATURE/ RENDER 常量
    │   ├── Island 类 - 岛屿数据结构
    │   ├── IslandPlacer 类 - 岛屿放置算法
    │   ├── genPoly() - 噪声多边形生成
    │   ├── fillPoly() - 多边形填充
    │   ├── pickLandPoints() - 空间哈希均匀选取
    │   ├── render() - 地图渲染
    │   └── generateMap() - 主入口
    ├── controller.js   # 界面控制器
    │   ├── init() - 初始化事件监听
    │   ├── exportMapData() - 导出地图 JSON
    │   ├── copyToClipboard() - 复制到剪贴板
    │   └── compressExportData() - 压缩导出数据
    └── compress.js     # 数据压缩模块
        ├── encodeRLE/ decodeRLE - 游程编码
        ├── encodeCoordinates/ decodeCoordinates - 坐标压缩
        ├── compressIslandGrid/ decompressIslandGrid - 岛屿网格压缩
        ├── compressVertices/ decompressVertices - 顶点压缩
        └── compressExportData/ decompressExportData - 完整数据压缩
```

### 核心算法

#### 岛屿生成 - 位置优先 + 碰撞检测

- **位置优先**：先确定岛屿位置（中心点），再生成地形
- **碰撞检测**：每个新岛屿检查与已有岛屿的最小距离，确保无重叠
- **三级降级策略**：空间不足时依次尝试：原始参数 → 缩小岛屿 → 放宽边界
- **独立岛屿**：岛屿之间不连接，每个岛屿是独立的地理单元

#### 特征生成 - 层级覆盖算法

- **层级顺序**：岛屿(Land) → 山峰(Mountain) → 湖泊(Lake) → 森林(Forest)
- **空间均匀分布**：使用网格哈希将岛屿划分为桶，每个桶选择一个特征点
- **遮罩填充**：只覆盖指定类型的单元格（如湖泊只覆盖普通陆地）

#### 岛屿/特征数量

- **范围随机数**：所有数量参数（岛屿、山峰、湖泊、森林）支持 min-max 范围形式
- **默认值**：上下界相同，保持固定数量行为
- **用户可调**：设置不同值实现随机数量

#### 岛屿数据结构

```javascript
Island {
  id: number,
  centerX: number,      // 岛屿中心 X
  centerY: number,      // 岛屿中心 Y
  radius: number,        // 基础半径
  collisionRadius: number, // 碰撞半径（用于碰撞检测）
  vertices: [[x,y], ...], // 噪声多边形顶点
  grid: [[x, y, type], ...], // 岛屿网格数据（只存储非空格子）
  offsetX: number,      // 在全局地图中的 X 偏移
  offsetY: number,      // 在全局地图中的 Y 偏移
  width: number,        // 岛屿边界框宽度
  height: number        // 岛屿边界框高度
}
```

#### 数据导出格式

```json
{
  "metadata": {
    "version": "v2-a2",
    "exportedAt": "2026-05-13T...",
    "compressed": true,
    "compressFormat": "v1"
  },
  "params": { /* 地图参数 */ },
  "terrainEnum": { /* 地形类型枚举 */ },
  "islands": [
    {
      "id": 0,
      "centerX": 160,
      "centerY": 160,
      "radius": 18,
      "collisionRadius": 29.2,
      "vertices":  "/* 压缩的顶点数据 */" ,
      "grid": "/* 压缩的网格数据 */ "
    }
  ]
}
```


### 快速开始

直接在浏览器中打开 `web-map-generator/v2/index.html`

---

## 算法对比

| 特性     | python-map-generator | web-map-generator       |
| -------- | -------------------- | ----------------------- |
| 岛屿连接 | 链式连接（桥梁）     | 独立岛屿                |
| 环境分布 | 连续渐变区域         | 离散点状分布            |
| 岛屿形状 | 噪声多边形           | 噪声多边形              |
| 布局策略 | 链式生长             | 位置优先 + 碰撞检测     |
| 特征分布 | 洪水填充扩散         | 空间哈希均匀选取        |
| 数据结构 | 全局 2D 网格         | 独立岛屿网格 + 稀疏存储 |
| 导出功能 | 无                   | gzip + base64 压缩 JSON |
| 岛屿数量 | 固定数量             | 范围随机数              |
| 交互方式 | 网页滑块控制         | 实时滑块控制            |
| 运行环境 | 需要 Python + Flask  | 纯浏览器（无需服务器）  |

---

## 技术细节

更详细的技术文档、参数说明、函数索引位于 [`CODEBASE_STATE.md`](./CODEBASE_STATE.md)。
