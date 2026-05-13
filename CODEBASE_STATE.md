# Codebase State

> 本文件记录项目的技术细节，供 Agent 和开发人员快速定位参考。
> **不要在此文件修改期间进行代码修改** —— 它是只读的参考文档。

---

## §13.1 目录结构

```
map-generate-demo/
├── python-map-generator/    # Python 版本（Flask + HTML）
│   ├── generator.py        # 核心算法（无头运行）
│   ├── simple_demo.py      # Pygame 演示（可独立运行）
│   ├── app.py              # Flask Web 服务
│   ├── templates/index.html # 前端页面
│   ├── static/js/main.js   # 前端交互逻辑
│   └── static/css/style.css
├── web-map-generator/       # Web 版本（纯 HTML/JS）
│   ├── v1/                 # 旧版实现
│   └── v2/                 # 当前版本
└── web-map-viewer/         # 预留（地图查看器）
```

---

## §13.2 技术栈速查

| 子项目               | 语言        | 框架/库        | 入口文件         |
| -------------------- | ----------- | -------------- | ---------------- |
| python-map-generator | Python      | Flask          | `app.py`         |
| python-map-generator | Python      | Pygame（可选） | `simple_demo.py` |
| web-map-generator    | HTML/CSS/JS | -              | `v2/index.html`  |

---

## §14 技术细节

### python-map-generator 核心算法

#### 1. 岛屿生成 - 链式生长算法

**文件**: `python-map-generator/generator.py`

**算法流程**:

1. **初始化**: 从地图中心放置第一个岛屿
2. **链式生长**: 后续岛屿从前一岛屿边缘随机点生长
   - 计算从岛屿中心指向边缘点的方向向量
   - 添加随机角度偏移（±60度）
   - 根据两岛屿半径计算距离
3. **噪声多边形**: 使用平滑漂移噪声沿圆周变化半径
   ```python
   drift += rng.uniform(-jitter, jitter)
   drift *= 0.90
   local_r = radius * (1.0 + drift)
   local_r = clamp(local_r, radius * 0.70, radius * 1.35)
   ```
4. **Bresenham 桥梁连接**: 用直线连接相邻岛屿中心

**关键函数**:

| 函数                              | 作用                 |
| --------------------------------- | -------------------- |
| `generate_islands()`              | 主入口，生成岛屿网格 |
| `generate_noisy_island_polygon()` | 生成噪声多边形顶点   |
| `fill_polygon()`                  | 填充多边形到网格     |
| `bresenham()`                     | 直线算法（桥梁连接） |

**可调参数**:

| 参数          | 默认值 | 说明                       |
| ------------- | ------ | -------------------------- |
| `radii`       | 35     | 岛屿半径（逗号分隔或单值） |
| `num_islands` | 1      | 岛屿数量                   |

#### 2. 环境生成 - 多种子洪水填充

**算法流程**:

1. 收集所有陆地单元格到 `unassigned` 集合
2. 随机选择未分配单元格作为种子
3. 根据权重和邻居影响选择环境类型
4. 使用洪水填充扩展区域
5. 受控随机性决定何时停止扩展

**邻近偏差公式**:

```
adjusted_weight = base_weight * (1 + adjacency_bias * nearby_count)
```

**切换概率公式**:

```
switch_prob = base_switch + (region_size * switch_growth) - (cohesion * cohesion_bias)
```

**可调参数**:

| 参数             | 默认值                                    | 说明                     |
| ---------------- | ----------------------------------------- | ------------------------ |
| `base_switch`    | 0.03                                      | 基础切换概率             |
| `switch_growth`  | 0.0025                                    | 每个单元格的切换概率增长 |
| `adjacency_bias` | 0.35                                      | 邻近偏差系数             |
| `cohesion_bias`  | 0.20                                      | 内聚性偏差系数           |
| `environments`   | `forest:5, plains:3, water:2, mountain:1` | 环境类型及权重           |

---

### web-map-generator 核心算法

**文件**: `web-map-generator/v2/index.js`

#### 1. 岛屿生成 - 网格分区 + 碰撞检测

**算法流程**:

1. 生成随机岛屿半径
2. 网格分区初步布局（尽量接近正方形）
3. 逐个放置岛屿（最多80次碰撞检测）
4. 前20次尝试：网格分区 + 随机偏移
5. 后续尝试：完全随机放置

**边界约束**:

```javascript
// 使用 MAX_RADIUS_RATIO=1.4 确保岛屿中心在安全范围内
const maxNoiseRadius = ri1 * ISLAND.MAX_RADIUS_RATIO;
const minBound = Math.ceil(maxNoiseRadius) + ISLAND.CENTER_MARGIN;
const maxBoundX = W - Math.ceil(maxNoiseRadius) - ISLAND.CENTER_MARGIN;
```

**碰撞检测**:

```javascript
minDist = islandRadius[j] + currentRadius + ISLAND.COLLISION_PADDING
if ((cx - px)² + (cy - py)² < minDist²) → 碰撞
```

**关键函数**:

| 函数             | 作用                       |
| ---------------- | -------------------------- |
| `placeIslands()` | 主入口，放置岛屿中心       |
| `spreadPoints()` | 网格分区布局               |
| `genPoly()`      | 生成噪声多边形             |
| `fillPoly()`     | 填充多边形（支持遮罩模式） |

**常量表** (`ISLAND`, `POLY`, `FEATURE`, `RENDER`):

| 常量              | 值       | 说明                       |
| ----------------- | -------- | -------------------------- |
| `ISLAND.POLY_SAMPLES` | 80       | 多边形采样点数             |
| `ISLAND.NOISE_JITTER` | 0.09     | 岛屿噪声强度               |
| `ISLAND.MIN_RADIUS_RATIO` | 0.65 | 多边形最小半径比例       |
| `ISLAND.MAX_RADIUS_RATIO` | 1.4     | 多边形最大半径比例         |
| `ISLAND.COLLISION_PADDING` | 3     | 碰撞检测额外间距           |
| `ISLAND.CENTER_MARGIN` | 2         | 岛屿中心边缘留白           |
| `ISLAND.MAX_PLACEMENT_ATTEMPTS` | 80 | 最大放置尝试次数         |
| `ISLAND.GRID_STRATEGY_ATTEMPTS` | 20 | 前N次使用网格分区策略   |
| `POLY.DRIFT_DECAY` | 0.9       | 噪声漂移衰减系数           |
| `FEATURE.MOUNTAIN.JITTER` | 0.13  | 山峰噪声强度               |
| `FEATURE.LAKE.JITTER` | 0.15      | 湖泊噪声强度               |
| `FEATURE.FOREST.JITTER` | 0.1     | 森林噪声强度               |
| `RENDER.SHADOW_ALPHA` | 0.14       | 边缘阴影透明度             |
| `RENDER.SHADOW_MIN_TILE` | 5        | 启用边缘阴影的最小tile    |

#### 2. 特征生成 - 层级覆盖算法

**地形类型枚举** (`TERRAIN`):

| 类型         | 值 | 说明     |
| ------------ | -- | -------- |
| `AIR_VACUUM` | 0  | 空域/真空 |
| `LAND`       | 1  | 普通陆地 |
| `MOUNTAIN`   | 2  | 山峰     |
| `LAKE`       | 3  | 湖泊     |
| `FOREST`     | 4  | 森林     |

**算法流程**:

1. **岛屿 (LAND)**: 基础陆地层
2. **山峰 (MOUNTAIN)**: 覆盖普通陆地
3. **湖泊 (LAKE)**: 覆盖普通陆地
4. **森林 (FOREST)**: 覆盖普通陆地

**空间哈希均匀选取**:

```javascript
cellSize = Math.floor(Math.sqrt(landCells.length / targetCount));
// 分桶 → 每桶选一个 → 不足时随机补充
```

**遮罩填充**:

```javascript
fillPoly(grid, W, H, poly, TERRAIN.LAKE, TERRAIN.LAND);
// 只覆盖 LAND 类型的单元格
```

#### 3. 渲染特性

- **像素风格**: 支持大像素模式（`tile >= RENDER.SHADOW_MIN_TILE`）的边缘阴影
- **内存优化**: 使用 `Uint8Array` 存储网格（每个单元格1字节）
- **种子 RNG**: 线性同余法（LCG），保证可重现性

---

## 算法对比

| 特性     | python-map-generator       | web-map-generator   |
| -------- | -------------------------- | ------------------- |
| 岛屿连接 | 链式连接（Bresenham 桥梁） | 独立岛屿            |
| 环境分布 | 连续渐变区域               | 离散点状分布        |
| 岛屿形状 | 噪声多边形                 | 噪声多边形          |
| 布局策略 | 链式生长                   | 网格分区 + 碰撞检测 |
| 特征分布 | 洪水填充扩散               | 空间哈希均匀选取    |
| 交互方式 | 网页滑块控制               | 实时滑块控制        |
| 运行环境 | 需要 Python + Flask        | 纯浏览器            |

---

## 运行方式

**python-map-generator**:

```bash
cd python-map-generator
pip install -r requirements.txt
python app.py
# 浏览器打开 http://localhost:5000
```

**web-map-generator**:

直接在浏览器中打开 `web-map-generator/v2/index.html`
