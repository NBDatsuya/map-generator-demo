/**
 * ============================================
 * Island Map Generator - Core Logic
 * 岛屿地图生成器 - 核心生成逻辑
 *
 * 重构版本：分离岛屿层和地形层
 * ============================================
 */

// ============================================
// 常量定义 / Constants
// ============================================

/** 地形类型枚举 / Terrain type enum */
export const TERRAIN = Object.freeze({
  AIR_VACUUM: -1, // 空域/真空
  ISLAND: 0, // 岛屿基础（待分配地形）
  LAND: 1, // 普通陆地
  MOUNTAIN: 2, // 山峰
  LAKE: 3, // 湖泊
  FOREST: 4, // 森林
});

/** 地形颜色映射 / Terrain color mapping - 使用计算属性名 */
export const TERRAIN_COLOR = {
  [TERRAIN.AIR_VACUUM]: "#1a1a2e", // 空域 - 深蓝色
  [TERRAIN.ISLAND]: "#d4a843", // 岛屿 - 金黄色
  [TERRAIN.LAND]: "#c9a032", // 陆地 - 稍深金黄
  [TERRAIN.MOUNTAIN]: "#8b8b8b", // 山峰 - 灰白色
  [TERRAIN.LAKE]: "#3a8fd6", // 湖泊 - 天蓝色
  [TERRAIN.FOREST]: "#2d7a2d", // 森林 - 深绿色
};

/** 岛屿生成参数 / Island generation parameters */
export const ISLAND = {
  POLY_SAMPLES: 80, // 多边形采样点数 / Polygon sample count
  NOISE_JITTER: 0.09, // 噪声强度 / Noise intensity
  MIN_RADIUS_RATIO: 0.65, // 多边形最小半径比例 / Min radius ratio
  MAX_RADIUS_RATIO: 1.4, // 多边形最大半径比例 / Max radius ratio
  COLLISION_PADDING: 4, // 碰撞检测额外间距 / Collision padding
  CENTER_MARGIN: 3, // 岛屿中心边缘留白 / Center margin
  MIN_SPACING_RATIO: 1.2, // 岛屿间最小间距比例（相对于最大半径） / Min spacing ratio
};

/** 多边形噪声参数 / Polygon noise parameters */
export const POLY = {
  DRIFT_DECAY: 0.9, // 噪声漂移衰减系数 / Drift decay factor
};

/** 特征生成参数 / Feature generation parameters */
export const FEATURE = {
  MOUNTAIN: { SAMPLES: 48, JITTER: 0.13 },
  LAKE: { SAMPLES: 40, JITTER: 0.15 },
  FOREST: { SAMPLES: 48, JITTER: 0.1 },
};

/** 渲染参数 / Render parameters */
export const RENDER = {
  SHADOW_ALPHA: 0.14, // 边缘阴影透明度 / Shadow alpha
  SHADOW_MIN_TILE: 5, // 启用边缘阴影的最小tile大小 / Min tile for shadow
};

// ============================================
// 辅助函数 / Utility Functions
// ============================================

/**
 * 约束值到指定范围 / Constrain value to range
 */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 点是否在多边形内（光线投射算法）
 */
export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1];
    const xj = poly[j][0],
      yj = poly[j][1];
    if (yi > py != yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ============================================
// 伪随机数生成器 / Seeded RNG
// ============================================

export function seededRng(seed) {
  let s = seed | 0;
  return {
    next() {
      s = (Math.imul(1664525, s) + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
    int(a, b) {
      return Math.floor(this.next() * (b - a)) + a;
    },
    float(a, b) {
      return this.next() * (b - a) + a;
    },
    choice(arr) {
      return arr[this.int(0, arr.length)];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

// ============================================
// 岛屿类 / Island Class
// ============================================

/**
 * 岛屿类 - 包含中心点、边缘顶点和像素网格
 *
 * 每个岛屿有自己的网格数据：
 * - grid: Array<[x, y, terrainType]> 只存储有内容的格子
 * - offsetX, offsetY: 在全局地图中的偏移
 * - width, height: 岛屿边界框尺寸（用于碰撞检测）
 *
 * 使用普通数组存储，JSON 序列化正常
 */
export class Island {
  constructor(id, centerX, centerY, radius, vertices) {
    this.id = id;
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.vertices = vertices;

    // 碰撞半径 = 基础半径 * 最大半径比例 + padding
    this.collisionRadius =
      radius * ISLAND.MAX_RADIUS_RATIO + ISLAND.COLLISION_PADDING;

    // 岛屿网格数据（由 createIslandGrid 创建）
    // 格式：[[x, y, terrainType], ...] 只存储非 AIR_VACUUM 的格子
    this.grid = [];
    this.offsetX = 0;
    this.offsetY = 0;
    this.width = 0;
    this.height = 0;
  }

  /**
   * 与另一个岛屿的碰撞距离
   */
  getCollisionDistance(other) {
    return this.collisionRadius + other.collisionRadius;
  }

  /**
   * 检测是否与另一个岛屿碰撞
   */
  collidesWith(other) {
    const dx = this.centerX - other.centerX;
    const dy = this.centerY - other.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < this.getCollisionDistance(other);
  }

  /**
   * 检测是否在地图边界内
   */
  fitsInBounds(mapWidth, mapHeight) {
    const margin = ISLAND.CENTER_MARGIN;
    const maxExtent = this.collisionRadius + ISLAND.CENTER_MARGIN;
    return (
      this.centerX >= margin + maxExtent &&
      this.centerX < mapWidth - margin - maxExtent &&
      this.centerY >= margin + maxExtent &&
      this.centerY < mapHeight - margin - maxExtent
    );
  }

  /**
   * 获取岛屿网格内可用的土地格子坐标
   * @returns {Array} [[x, y], ...] 相对于岛屿网格的坐标
   */
  getLandCells() {
    if (!this.grid || !this.grid.length) return [];
    // 返回 ISLAND 类型的格子坐标
    return this.grid
      .filter(([, , type]) => type === TERRAIN.ISLAND)
      .map(([x, y]) => [x, y]);
  }

  /**
   * 检查指定坐标是否在岛屿范围内
   */
  hasCellAt(x, y) {
    return this.grid.some(([cx, cy]) => cx === x && cy === y);
  }

  /**
   * 获取指定坐标的地形类型
   */
  getCellType(x, y) {
    const cell = this.grid.find(([cx, cy]) => cx === x && cy === y);
    return cell ? cell[2] : TERRAIN.AIR_VACUUM; // 这里的2不会越界吗？cell哪里来的第三个项
  }

  /**
   * 设置指定坐标的地形类型
   */
  setCellType(x, y, type) {
    const idx = this.grid.findIndex(([cx, cy]) => cx === x && cy === y);
    if (idx >= 0) {
      this.grid[idx][2] = type;
    }
  }
}

// ============================================
// 多边形生成 / Polygon Generation
// ============================================

export function genPoly(cx, cy, r, samples, jitter, rng) {
  let drift = 0;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    drift += rng.next() * jitter * 2 - jitter;
    drift *= POLY.DRIFT_DECAY;
    let lr = r * (1 + drift);
    lr = clamp(lr, r * ISLAND.MIN_RADIUS_RATIO, r * ISLAND.MAX_RADIUS_RATIO);
    pts.push([cx + Math.cos(theta) * lr, cy + Math.sin(theta) * lr]);
  }
  return pts;
}

// ============================================
// 多边形填充 / Polygon Fill
// ============================================

/**
 * 填充多边形到网格（O(n×m) 复杂度优化版）
 * @param {Uint8Array[]} grid - 二维网格
 * @param {number} W - 网格宽度
 * @param {number} H - 网格高度
 * @param {Array} poly - 多边形顶点 [[x,y], ...]
 * @param {number} val - 填充值
 */
export function fillPoly(grid, W, H, poly, val) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, poly)) {
        grid[y][x] = val;
      }
    }
  }
}

/**
 * 在岛屿网格内填充多边形
 * @param {Island} island - 岛屿对象
 * @param {number} cx - 中心X（相对于岛屿网格）
 * @param {number} cy - 中心Y（相对于岛屿网格）
 * @param {number} r - 半径
 * @param {number} type - 地形类型
 * @param {number} samples - 采样点数
 * @param {number} jitter - 抖动量
 * @param {object} rng - 随机数生成器
 */
function fillFeatureInIsland(island, cx, cy, r, type, samples, jitter, rng) {
  const poly = genPoly(cx, cy, r, samples, jitter, rng);

  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(island.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(island.height - 1, Math.ceil(Math.max(...ys)));

  // 还是太复杂了时间
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, poly)) {
        // 只覆盖 ISLAND 类型的格子
        if (island.getCellType(x, y) === TERRAIN.ISLAND) {
          island.setCellType(x, y, type);
        }
      }
    }
  }
}

// ============================================
// 岛屿网格创建 / Island Grid Creation
// ============================================

/**
 * 从顶点创建岛屿网格
 * @param {Array} vertices - 多边形顶点
 * @returns {object} { grid, offsetX, offsetY, width, height }
 */
function createIslandGridFromVertices(vertices) {
  const xs = vertices.map((p) => p[0]);
  const ys = vertices.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs));
  const x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));

  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;

  // 先创建临时网格用于检测哪些点在多边形内
  const tempGrid = Array.from({ length: height }, () => new Uint8Array(width));
  const localVertices = vertices.map(([vx, vy]) => [vx - x0, vy - y0]);
  fillPoly(tempGrid, width, height, localVertices, 1);

  // 转换为 [[x, y, type], ...] 格式，只存储有内容的格子
  const grid = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tempGrid[y][x] === 1) {
        grid.push([x, y, TERRAIN.ISLAND]);
      }
    }
  }

  return {
    grid,
    offsetX: x0,
    offsetY: y0,
    width,
    height,
  };
}

// ============================================
// 岛屿放置器 / Island Placer
// ============================================

/**
 * 岛屿放置器 - Poisson Disk Sampling 风格算法
 */
export class IslandPlacer {
  constructor(W, H, ni, ri0, ri1, rng) {
    this.W = W;
    this.H = H;
    this.rng = rng;
    this.margin = ISLAND.CENTER_MARGIN;

    // 限制岛屿半径
    const minDim = Math.min(W, H);
    ri0 = Math.max(ri0, ISLAND.MIN_ISLAND_RADIUS || 6);
    ri1 = Math.min(ri1, Math.floor(minDim * 0.25));

    this.ri0 = ri0;
    this.ri1Original = ri1;
    this.ri1 = ri1;

    // 计算最小间距
    const maxCollisionR =
      ri1 * ISLAND.MAX_RADIUS_RATIO + ISLAND.COLLISION_PADDING;
    this.minSpacing = maxCollisionR * 2 * ISLAND.MIN_SPACING_RATIO;

    const maxExtent = ri1 * ISLAND.MAX_RADIUS_RATIO;
    this.unifiedBoundaryMargin = maxExtent + this.margin;
  }

  hasMinSpacing(cx, cy, placed) {
    for (const existing of placed) {
      const dx = cx - existing.centerX;
      const dy = cy - existing.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.minSpacing) {
        return false;
      }
    }
    return true;
  }

  tryPlace(targetCount, minCX, maxCX, minCY, maxCY, ri0, ri1) {
    const placed = [];
    const minSpacing =
      (ri1 * ISLAND.MAX_RADIUS_RATIO + ISLAND.COLLISION_PADDING) *
      2 *
      ISLAND.MIN_SPACING_RATIO;

    let attempts = 0;
    const maxAttempts = targetCount * 200;

    while (placed.length < targetCount && attempts < maxAttempts) {
      attempts++;

      const radius = this.rng.int(ri0, ri1 + 1);
      const cx = this.rng.int(minCX, maxCX + 1);
      const cy = this.rng.int(minCY, maxCY + 1);

      let hasSpace = true;
      for (const existing of placed) {
        const dx = cx - existing.centerX;
        const dy = cy - existing.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minSpacing) {
          hasSpace = false;
          break;
        }
      }

      if (hasSpace) {
        placed.push({ id: placed.length, centerX: cx, centerY: cy, radius });
      }
    }

    return placed;
  }

  place(targetCount) {
    const W = this.W;
    const H = this.H;
    let placed = [];

    const maxExtent = this.ri1 * ISLAND.MAX_RADIUS_RATIO;
    let boundaryMargin = maxExtent + this.margin;

    let minCX = boundaryMargin;
    let maxCX = W - boundaryMargin;
    let minCY = boundaryMargin;
    let maxCY = H - boundaryMargin;

    placed = this.tryPlace(
      targetCount,
      minCX,
      maxCX,
      minCY,
      maxCY,
      this.ri0,
      this.ri1,
    );

    if (placed.length < targetCount && this.ri1 > this.ri0) {
      for (let newRi1 = this.ri1 - 1; newRi1 >= this.ri0; newRi1--) {
        const newMaxExtent = newRi1 * ISLAND.MAX_RADIUS_RATIO;
        const newBoundaryMargin = newMaxExtent + this.margin;

        minCX = newBoundaryMargin;
        maxCX = W - newBoundaryMargin;
        minCY = newBoundaryMargin;
        maxCY = H - newBoundaryMargin;

        placed = this.tryPlace(
          targetCount,
          minCX,
          maxCX,
          minCY,
          maxCY,
          this.ri0,
          newRi1,
        );

        if (placed.length >= targetCount) {
          this.ri1 = newRi1;
          break;
        }
      }
    }

    if (placed.length < targetCount) {
      const fallbackMargin = Math.floor(boundaryMargin * 0.6);

      minCX = fallbackMargin;
      maxCX = W - fallbackMargin;
      minCY = fallbackMargin;
      maxCY = H - fallbackMargin;

      placed = this.tryPlace(
        targetCount,
        minCX,
        maxCX,
        minCY,
        maxCY,
        this.ri0,
        this.ri1,
      );
    }

    this.placedCount = placed.length;

    return placed;
  }
}

// ============================================
// 特征选择 / Feature Selection
// ============================================

/**
 * 空间哈希均匀选择点
 */
export function pickLandPoints(landCells, m, rng) {
  if (!landCells.length) return [];
  if (m >= landCells.length) return landCells.slice();

  const cellSize = Math.max(1, Math.floor(Math.sqrt(landCells.length / m)));
  const buckets = {};

  for (const [x, y] of landCells) {
    const k = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push([x, y]);
  }

  const keys = Object.keys(buckets);
  rng.shuffle(keys);
  const chosen = [];
  for (let i = 0; i < Math.min(m, keys.length); i++) {
    const b = buckets[keys[i]];
    chosen.push(b[rng.int(0, b.length)]);
  }

  while (chosen.length < m && chosen.length < landCells.length) {
    const e = landCells[rng.int(0, landCells.length)];
    if (!chosen.some((p) => p[0] === e[0] && p[1] === e[1])) {
      chosen.push(e);
    }
  }
  return chosen;
}

/**
 * 在岛屿内生成特征（山脉/湖泊/森林）
 */
function genFeaturesInIsland(
  island,
  rng,
  type,
  count,
  rRange,
  samples,
  jitter,
) {
  if (count <= 0) return;
  const cells = island.getLandCells();
  const pts = pickLandPoints(cells, count, rng);

  for (const [cx, cy] of pts) {
    const r = rng.int(rRange[0], rRange[1] + 1);
    fillFeatureInIsland(island, cx, cy, r, type, samples, jitter, rng);
  }
}

// ============================================
// 渲染 / Rendering
// ============================================

/**
 * 渲染地图
 * @param {Island[]} islands - 岛屿数组
 * @param {number} W - 地图宽度
 * @param {number} H - 地图高度
 * @param {number} tile - 格子像素大小
 */
export function render(islands, W, H, tile) {
  const canvas = document.getElementById("map");
  canvas.width = W * tile;
  canvas.height = H * tile;
  const ctx = canvas.getContext("2d");

  // 填充背景为 AIR_VACUUM
  ctx.fillStyle = TERRAIN_COLOR[TERRAIN.AIR_VACUUM];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 渲染每个岛屿的网格
  islands.forEach((island) => {
    const offsetX = island.offsetX;
    const offsetY = island.offsetY;

    // grid 格式：[[x, y, type], ...]
    for (const [x, y, type] of island.grid) {
      ctx.fillStyle = TERRAIN_COLOR[type];
      ctx.fillRect((offsetX + x) * tile, (offsetY + y) * tile, tile, tile);
    }
  });

  // 边缘阴影效果
  if (tile >= RENDER.SHADOW_MIN_TILE) {
    ctx.globalAlpha = RENDER.SHADOW_ALPHA;

    // 创建临时数组来追踪哪些格子属于岛屿
    const islandMask = new Uint8Array(W * H);

    for (const island of islands) {
      const offsetX = island.offsetX;
      const offsetY = island.offsetY;

      for (const [x, y] of island.grid) {
        islandMask[(offsetY + y) * W + (offsetX + x)] = 1;
      }
    }

    // 绘制边缘阴影
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (islandMask[idx]) {
          // 上边或左边 - 高光
          if (!islandMask[(y - 1) * W + x] || !islandMask[y * W + (x - 1)]) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(x * tile, y * tile, tile, tile);
          }
          // 下边或右边 - 阴影
          if (!islandMask[(y + 1) * W + x] || !islandMask[y * W + (x + 1)]) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(x * tile, y * tile, tile, tile);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // 岛屿中心标记
    ctx.fillStyle = "rgba(255,220,80,0.8)";
    for (const island of islands) {
      ctx.beginPath();
      ctx.arc(
        island.centerX * tile + tile / 2,
        island.centerY * tile + tile / 2,
        3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/**
 * 更新统计信息
 */
export function updateStats(islands, W, H, islandCount) {
  const counts = {};
  counts[TERRAIN.ISLAND] = 0;
  counts[TERRAIN.LAND] = 0;
  counts[TERRAIN.MOUNTAIN] = 0;
  counts[TERRAIN.LAKE] = 0;
  counts[TERRAIN.FOREST] = 0;

  // 统计所有岛屿网格的地形
  for (const island of islands) {
    for (const [, , type] of island.grid) {
      counts[type] = (counts[type] || 0) + 1;
    }
  }

  const total = W * H;
  const landPercent = (
    ((counts[TERRAIN.LAND] +
      counts[TERRAIN.MOUNTAIN] +
      counts[TERRAIN.LAKE] +
      counts[TERRAIN.FOREST] +
      counts[TERRAIN.ISLAND]) /
      total) *
    100
  ).toFixed(1);

  document.getElementById("stats").innerHTML =
    `Land ${landPercent}% | Islands ${islandCount} | Mtn ${counts[TERRAIN.MOUNTAIN]} · Lake ${counts[TERRAIN.LAKE]} · Forest ${counts[TERRAIN.FOREST]}`;
}

// ============================================
// 参数管理 / Parameter Management
// ============================================

export const getVal = (id) => +document.getElementById(id).value;

export function getMapParams() {
  return {
    W: getVal("mw"),
    H: getVal("mh"),
    tile: getVal("tile"),
    seed: getVal("seed"),
  };
}

export function getRangeParams() {
  const norm = (loId, hiId) => {
    const lo = getVal(loId),
      hi = getVal(hiId);
    return [Math.min(lo, hi), Math.max(lo, hi)];
  };
  return {
    island: { r: norm("ri0", "ri1"), n: norm("ni0", "ni1") },
    mountain: { r: norm("rm0", "rm1"), n: norm("nm0", "nm1") },
    lake: { r: norm("rx0", "rx1"), n: norm("nx0", "nx1") },
    forest: { r: norm("ry0", "ry1"), n: norm("ny0", "ny1") },
  };
}

export const randInRange = (rng, [lo, hi]) => rng.int(lo, hi + 1);

// ============================================
// 主生成函数 / Main Generation
// ============================================

/**
 * 生成地图并返回结果对象
 * @returns {Object} 包含 islands, W, H, params 等信息
 */
export function generateMap() {
  const { W, H, tile, seed } = getMapParams();
  const p = getRangeParams();
  const rng = seededRng(seed);

  // 随机数量
  const ni = randInRange(rng, p.island.n);
  const nm = randInRange(rng, p.mountain.n);
  const nx = randInRange(rng, p.lake.n);
  const ny = randInRange(rng, p.forest.n);

  // Step 1: 放置岛屿中心并生成顶点
  const placer = new IslandPlacer(W, H, ni, ...p.island.r, rng);
  const placedPositions = placer.place(ni);

  // Step 2: 创建岛屿对象和网格
  const islands = [];
  for (const pos of placedPositions) {
    // 生成多边形顶点
    const vertices = genPoly(
      pos.centerX,
      pos.centerY,
      pos.radius,
      ISLAND.POLY_SAMPLES,
      ISLAND.NOISE_JITTER,
      rng,
    );

    // 创建岛屿对象
    const island = new Island(
      pos.id,
      pos.centerX,
      pos.centerY,
      pos.radius,
      vertices,
    );

    // 创建岛屿网格
    const { grid, offsetX, offsetY, width, height } =
      createIslandGridFromVertices(vertices);
    island.grid = grid;
    island.offsetX = offsetX;
    island.offsetY = offsetY;
    island.width = width;
    island.height = height;

    islands.push(island);
  }

  // Step 3: 在每个岛屿内生成特征
  for (const island of islands) {
    genFeaturesInIsland(
      island,
      rng,
      TERRAIN.MOUNTAIN,
      nm,
      p.mountain.r,
      FEATURE.MOUNTAIN.SAMPLES,
      FEATURE.MOUNTAIN.JITTER,
    );
    genFeaturesInIsland(
      island,
      rng,
      TERRAIN.LAKE,
      nx,
      p.lake.r,
      FEATURE.LAKE.SAMPLES,
      FEATURE.LAKE.JITTER,
    );
    genFeaturesInIsland(
      island,
      rng,
      TERRAIN.FOREST,
      ny,
      p.forest.r,
      FEATURE.FOREST.SAMPLES,
      FEATURE.FOREST.JITTER,
    );
  }

  // Step 4: 渲染
  render(islands, W, H, tile);
  updateStats(islands, W, H, islands.length);

  // 返回结果对象
  return {
    islands,
    W,
    H,
    tile,
    seed,
    params: {
      map: { W, H, tile, seed },
      ranges: p,
      counts: {
        islands: islands.length,
        mountains: nm,
        lakes: nx,
        forests: ny,
      },
    },
  };
}
