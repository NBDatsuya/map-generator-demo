/**
 * ============================================
 * Interactive Island Map Generator V2
 * 交互式岛屿地图生成器 V2
 *
 * Algorithm / 算法特点:
 * - Island: Place center first, then generate terrain at position
 * - 岛屿：先确定中心位置，再在位置上生成地形
 * - Feature: Hierarchical coverage (Land → Mountain → Lake → Forest)
 * - 特征：层级覆盖算法
 * - Distribution: Grid-based spacing to avoid overlap
 * - 分布：基于网格的间距算法避免重叠
 *
 * By David
 * ============================================
 */

// ============================================
// 常量定义 / Constants
// ============================================

/** 地形类型枚举 / Terrain type enum */
const TERRAIN = Object.freeze({
  AIR_VACUUM: 0, // 空域/真空
  LAND: 1, // 普通陆地
  MOUNTAIN: 2, // 山峰
  LAKE: 3, // 湖泊
  FOREST: 4, // 森林
});

/** 地形颜色映射（按枚举索引顺序）/ Terrain color mapping */
const COLORS = [
  "#1a1a2e", // AIR_VACUUM - 深蓝色空域
  "#d4a843", // LAND - 金黄色岛屿
  "#8b8b8b", // MOUNTAIN - 灰白色山峰
  "#3a8fd6", // LAKE - 天蓝色湖泊
  "#2d7a2d", // FOREST - 深绿色森林
];

/** 岛屿生成参数 / Island generation parameters */
const ISLAND = {
  POLY_SAMPLES: 80, // 多边形采样点数 / Polygon sample count
  NOISE_JITTER: 0.09, // 噪声强度 / Noise intensity
  MIN_RADIUS_RATIO: 0.65, // 多边形最小半径比例 / Min radius ratio
  MAX_RADIUS_RATIO: 1.4, // 多边形最大半径比例 / Max radius ratio
  COLLISION_PADDING: 4, // 碰撞检测额外间距 / Collision padding
  CENTER_MARGIN: 3, // 岛屿中心边缘留白 / Center margin
  MIN_SPACING_RATIO: 1.2, // 岛屿间最小间距比例（相对于最大半径） / Min spacing ratio
};

/** 多边形噪声参数 / Polygon noise parameters */
const POLY = {
  DRIFT_DECAY: 0.9, // 噪声漂移衰减系数 / Drift decay factor
};

/** 特征生成参数 / Feature generation parameters */
const FEATURE = {
  MOUNTAIN: { SAMPLES: 48, JITTER: 0.13 },
  LAKE: { SAMPLES: 40, JITTER: 0.15 },
  FOREST: { SAMPLES: 48, JITTER: 0.1 },
};

/** 渲染参数 / Render parameters */
const RENDER = {
  SHADOW_ALPHA: 0.14, // 边缘阴影透明度 / Shadow alpha
  SHADOW_MIN_TILE: 5, // 启用边缘阴影的最小tile大小 / Min tile for shadow
};

// ============================================
// 辅助函数 / Utility Functions
// ============================================

/**
 * 约束值到指定范围 / Constrain value to range
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 点是否在多边形内（光线投射算法）
 */
function pointInPoly(px, py, poly) {
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

function seededRng(seed) {
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
// 岛屿位置信息 / Island Position
// ============================================

/**
 * 简化的岛屿位置信息
 * 只存储位置和基础半径，不在放置前生成多边形
 */
class IslandPosition {
  constructor(id, centerX, centerY, radius) {
    this.id = id;
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    // 碰撞半径 = 基础半径 * 最大半径比例 + padding
    this.collisionRadius = radius * ISLAND.MAX_RADIUS_RATIO + ISLAND.COLLISION_PADDING;
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
}

// ============================================
// 多边形生成 / Polygon Generation
// ============================================

function genPoly(cx, cy, r, samples, jitter, rng) {
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

function fillPoly(grid, W, H, poly, val, maskVal) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (pointInPoly(x + 0.5, y + 0.5, poly)) {
        if (maskVal === undefined || grid[y][x] === maskVal) {
          grid[y][x] = val;
        }
      }
    }
  }
}

// ============================================
// 岛屿放置器 / Island Placer
// ============================================

/**
 * 岛屿放置器 - Poisson Disk Sampling 风格算法
 * 
 * 策略：
 * 1. 在网格内完全随机放置
 * 2. 使用 Poisson Disk Sampling 保证最小间距
 * 3. 碰撞检测确保不重叠
 * 4. 特殊情况处理：空间不足时缩减半径或放宽边界约束
 */
class IslandPlacer {
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
    this.ri1Original = ri1; // 保存原始值用于回退
    this.ri1 = ri1;

    // 计算最小间距：岛屿最大半径 * 2 + padding * 2
    const maxCollisionR = ri1 * ISLAND.MAX_RADIUS_RATIO + ISLAND.COLLISION_PADDING;
    this.minSpacing = maxCollisionR * 2 * ISLAND.MIN_SPACING_RATIO;

    // 统一边界安全距离：使用最大岛屿半径，确保所有岛屿都不会超出
    const maxExtent = ri1 * ISLAND.MAX_RADIUS_RATIO;
    this.unifiedBoundaryMargin = maxExtent + this.margin;
  }

  /**
   * 检查新位置是否与已放置岛屿保持最小间距
   */
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

  /**
   * 尝试放置岛屿的核心逻辑
   */
  tryPlace(targetCount, minCX, maxCX, minCY, maxCY, ri0, ri1) {
    const placed = [];
    const minSpacing = (ri1 * ISLAND.MAX_RADIUS_RATIO + ISLAND.COLLISION_PADDING) * 2 * ISLAND.MIN_SPACING_RATIO;
    
    let attempts = 0;
    const maxAttempts = targetCount * 200;

    while (placed.length < targetCount && attempts < maxAttempts) {
      attempts++;

      // 随机半径
      const radius = this.rng.int(ri0, ri1 + 1);

      // 随机位置
      const cx = this.rng.int(minCX, maxCX + 1);
      const cy = this.rng.int(minCY, maxCY + 1);

      // 检查间距
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
        placed.push(new IslandPosition(placed.length, cx, cy, radius));
      }
    }

    return placed;
  }

  /**
   * 放置岛屿
   * 返回 IslandPosition 数组
   */
  place(targetCount) {
    const W = this.W;
    const H = this.H;
    let placed = [];

    // 计算初始安全边界
    const maxExtent = this.ri1 * ISLAND.MAX_RADIUS_RATIO;
    let boundaryMargin = maxExtent + this.margin;

    // 策略1: 尝试使用原始参数放置
    let minCX = boundaryMargin;
    let maxCX = W - boundaryMargin;
    let minCY = boundaryMargin;
    let maxCY = H - boundaryMargin;

    placed = this.tryPlace(targetCount, minCX, maxCX, minCY, maxCY, this.ri0, this.ri1);

    // 如果放不下，策略2: 逐步缩小岛屿最大半径
    if (placed.length < targetCount && this.ri1 > this.ri0) {
      for (let newRi1 = this.ri1 - 1; newRi1 >= this.ri0; newRi1--) {
        const newMaxExtent = newRi1 * ISLAND.MAX_RADIUS_RATIO;
        const newBoundaryMargin = newMaxExtent + this.margin;
        
        minCX = newBoundaryMargin;
        maxCX = W - newBoundaryMargin;
        minCY = newBoundaryMargin;
        maxCY = H - newBoundaryMargin;

        placed = this.tryPlace(targetCount, minCX, maxCX, minCY, maxCY, this.ri0, newRi1);

        if (placed.length >= targetCount) {
          this.ri1 = newRi1; // 更新当前使用的最大半径
          break;
        }
      }
    }

    // 如果还是放不下，策略3: 放宽边界约束（各退一步）
    if (placed.length < targetCount) {
      const fallbackMargin = Math.floor(boundaryMargin * 0.6); // 缩减40%的边界

      minCX = fallbackMargin;
      maxCX = W - fallbackMargin;
      minCY = fallbackMargin;
      maxCY = H - fallbackMargin;

      placed = this.tryPlace(targetCount, minCX, maxCX, minCY, maxCY, this.ri0, this.ri1);
    }

    // 记录实际放置数量
    this.placedCount = placed.length;

    return placed;
  }
}

// ============================================
// 特征选择 / Feature Selection
// ============================================

function getLandCells(grid, W, H) {
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === TERRAIN.LAND) cells.push([x, y]);
    }
  }
  return cells;
}

function pickLandPoints(landCells, m, rng) {
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

function genFeatures(grid, W, H, rng, type, count, rRange, samples, jitter) {
  if (count <= 0) return;
  const cells = getLandCells(grid, W, H);
  const pts = pickLandPoints(cells, count, rng);
  for (const [cx, cy] of pts) {
    const r = Math.floor(rng.next() * (rRange[1] - rRange[0] + 1)) + rRange[0];
    const poly = genPoly(cx, cy, r, samples, jitter, rng);
    fillPoly(grid, W, H, poly, type, TERRAIN.LAND);
  }
}

// ============================================
// 渲染 / Rendering
// ============================================

function render(grid, W, H, tile, islandPositions) {
  const canvas = document.getElementById("map");
  canvas.width = W * tile;
  canvas.height = H * tile;
  const ctx = canvas.getContext("2d");

  // Draw terrain
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = COLORS[grid[y][x]];
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }

  // Edge shadow
  if (tile >= RENDER.SHADOW_MIN_TILE) {
    ctx.globalAlpha = RENDER.SHADOW_ALPHA;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== TERRAIN.AIR_VACUUM) {
          if (
            grid[y - 1][x] === TERRAIN.AIR_VACUUM ||
            grid[y][x - 1] === TERRAIN.AIR_VACUUM
          ) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(x * tile, y * tile, tile, tile);
          }
          if (
            grid[y + 1][x] === TERRAIN.AIR_VACUUM ||
            grid[y][x + 1] === TERRAIN.AIR_VACUUM
          ) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(x * tile, y * tile, tile, tile);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // Island center markers
    ctx.fillStyle = "rgba(255,220,80,0.8)";
    for (const island of islandPositions) {
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

function updateStats(grid, W, H, islandCount) {
  const counts = new Array(Object.keys(TERRAIN).length).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) counts[grid[y][x]]++;
  }
  const total = W * H;
  const landPercent = (
    ((counts[TERRAIN.LAND] +
      counts[TERRAIN.MOUNTAIN] +
      counts[TERRAIN.LAKE] +
      counts[TERRAIN.FOREST]) /
      total) *
    100
  ).toFixed(1);
  document.getElementById("stats").innerHTML =
    `Land ${landPercent}% | Islands ${islandCount} | Mtn ${counts[TERRAIN.MOUNTAIN]} · Lake ${counts[TERRAIN.LAKE]} · Forest ${counts[TERRAIN.FOREST]}`;
}

// ============================================
// 参数管理 / Parameter Management
// ============================================

const getVal = (id) => +document.getElementById(id).value;

function getMapParams() {
  return {
    W: getVal("mw"),
    H: getVal("mh"),
    tile: getVal("tile"),
    seed: getVal("seed"),
  };
}

function getRangeParams() {
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

const randInRange = (rng, [lo, hi]) => rng.int(lo, hi + 1);

// ============================================
// 主生成函数 / Main Generation
// ============================================

function generate() {
  const { W, H, tile, seed } = getMapParams();
  const p = getRangeParams();
  const rng = seededRng(seed);

  // Initialize grid
  const grid = Array.from({ length: H }, () => new Uint8Array(W));

  // Random counts
  const ni = randInRange(rng, p.island.n);
  const nm = randInRange(rng, p.mountain.n);
  const nx = randInRange(rng, p.lake.n);
  const ny = randInRange(rng, p.forest.n);

  // Step 1: Place island centers first
  const placer = new IslandPlacer(W, H, ni, ...p.island.r, rng);
  const islandPositions = placer.place(ni);
  const actualIslandCount = islandPositions.length;

  // Step 2: Generate terrain at positions
  for (const island of islandPositions) {
    const poly = genPoly(
      island.centerX,
      island.centerY,
      island.radius,
      ISLAND.POLY_SAMPLES,
      ISLAND.NOISE_JITTER,
      rng
    );
    fillPoly(grid, W, H, poly, TERRAIN.LAND);
  }

  // Step 3: Generate features
  genFeatures(
    grid, W, H, rng,
    TERRAIN.MOUNTAIN, nm,
    p.mountain.r,
    FEATURE.MOUNTAIN.SAMPLES,
    FEATURE.MOUNTAIN.JITTER,
  );
  genFeatures(
    grid, W, H, rng,
    TERRAIN.LAKE, nx,
    p.lake.r,
    FEATURE.LAKE.SAMPLES,
    FEATURE.LAKE.JITTER,
  );
  genFeatures(
    grid, W, H, rng,
    TERRAIN.FOREST, ny,
    p.forest.r,
    FEATURE.FOREST.SAMPLES,
    FEATURE.FOREST.JITTER,
  );

  // Render
  render(grid, W, H, tile, islandPositions);
  updateStats(grid, W, H, actualIslandCount);
}

function randomSeed() {
  document.getElementById("seed").value = Math.floor(Math.random() * 99999);
  generate();
}

// ============================================
// 初始化 / Initialization
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("generateBtn").addEventListener("click", generate);
  document.getElementById("randomSeedBtn").addEventListener("click", randomSeed);
  generate();
});
