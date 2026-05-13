/**
 * ============================================
 * Interactive Island Map Generator
 * 交互式岛屿地图生成器
 * 
 * 算法特点：
 * - 岛屿：网格分区 + 碰撞检测（独立岛屿，无连接）
 * - 特征：层级覆盖算法（Land → Mountain → Lake → Forest）
 * - 分布：空间哈希均匀选取
 * 
 * By David
 * ============================================
 */

// ============================================
// 常量定义 / Constants
// ============================================

/** 地形类型枚举值 */
const OCEAN = 0;    // 海洋
const LAND = 1;     // 普通陆地
const MOUNTAIN = 2; // 山峰
const LAKE = 3;     // 湖泊
const FOREST = 4;   // 森林

/** 地形颜色映射（按枚举索引顺序） */
const COLORS = [
  '#1a1a2e', // OCEAN - 深蓝色海洋
  '#d4a843', // LAND - 金黄色岛屿
  '#8b8b8b', // MOUNTAIN - 灰白色山峰
  '#3a8fd6', // LAKE - 天蓝色湖泊
  '#2d7a2d', // FOREST - 深绿色森林
];

// ============================================
// 辅助函数 / Utility Functions
// ============================================

/**
 * 约束值到指定范围
 * @param {number} v - 输入值
 * @param {number} lo - 下界
 * @param {number} hi - 上界
 * @returns {number} 约束后的值
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 点是否在多边形内（光线投射算法）
 * 
 * 算法原理：从目标点向右发射一条射线，统计射线与多边形边界的交点数量。
 * 奇数个交点表示点在多边形内，偶数个表示在外。
 * 
 * @param {number} px - 点的X坐标
 * @param {number} py - 点的Y坐标
 * @param {number[][]} poly - 多边形顶点数组 [[x,y], ...]
 * @returns {boolean} 是否在多边形内
 */
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    // 检测射线与边的交点
    if (yi > py != yj > py && 
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ============================================
// 伪随机数生成器 / Seeded RNG
// ============================================

/**
 * 创建基于种子的伪随机数生成器
 * 使用线性同余法（LCG），保证相同种子产生相同序列
 * 
 * @param {number} seed - 随机种子
 * @returns {object} RNG 对象
 */
function seededRng(seed) {
  let s = seed | 0;
  return {
    /** 生成 [0, 1) 区间的随机数 */
    next() {
      s = (Math.imul(1664525, s) + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
    /** 生成 [a, b) 区间的随机整数 */
    int(a, b) {
      return Math.floor(this.next() * (b - a)) + a;
    },
    /** 生成 [a, b) 区间的随机浮点数 */
    float(a, b) {
      return this.next() * (b - a) + a;
    },
    /** 从数组中随机选择一个元素 */
    choice(arr) {
      return arr[this.int(0, arr.length)];
    },
    /** Fisher-Yates 洗牌算法 */
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
// 多边形生成 / Polygon Generation
// ============================================

/**
 * 生成带噪声的多边形顶点（用于岛屿等自然形状）
 * 
 * 算法：沿圆周采样，通过累积漂移产生平滑的半径变化
 * - drift 累积噪声，乘以 0.9 实现平滑过渡
 * - clamp 限制半径变化范围，防止极端变形
 * 
 * @param {number} cx - 中心X坐标
 * @param {number} cy - 中心Y坐标
 * @param {number} r - 基础半径
 * @param {number} samples - 采样点数（越多越精细）
 * @param {number} jitter - 噪声强度
 * @param {object} rng - 随机数生成器
 * @returns {number[][]} 多边形顶点数组
 */
function genPoly(cx, cy, r, samples, jitter, rng) {
  let drift = 0;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    // 累积漂移 + 衰减，产生平滑的自然轮廓
    drift += rng.next() * jitter * 2 - jitter;
    drift *= 0.9;
    let lr = r * (1 + drift);
    lr = clamp(lr, r * 0.65, r * 1.4); // 限制半径变化范围
    pts.push([cx + Math.cos(theta) * lr, cy + Math.sin(theta) * lr]);
  }
  return pts;
}

// ============================================
// 多边形填充 / Polygon Fill
// ============================================

/**
 * 在网格上填充多边形区域
 * 
 * 算法：遍历多边形边界框内的所有单元格，使用射线投射检测是否在多边形内
 * 支持遮罩模式：只覆盖指定值的单元格
 * 
 * @param {Uint8Array[]} grid - 2D 网格数组
 * @param {number} W - 网格宽度
 * @param {number} H - 网格高度
 * @param {number[][]} poly - 多边形顶点
 * @param {number} val - 填充值
 * @param {number} [maskVal] - 遮罩值（可选，仅覆盖该值的单元格）
 */
function fillPoly(grid, W, H, poly, val, maskVal) {
  // 计算多边形边界框，减少遍历次数
  const xs = poly.map(p => p[0]);
  const ys = poly.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  
  // 逐像素检测填充
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, poly)) {
        // 遮罩模式：只有单元格值匹配时才覆盖
        if (maskVal === undefined || grid[y][x] === maskVal) {
          grid[y][x] = val;
        }
      }
    }
  }
}

// ============================================
// 岛屿布局算法 / Island Placement
// ============================================

/**
 * 网格分区布局算法
 * 
 * 算法：
 * 1. 将地图划分为 n 个网格单元
 * 2. 每个网格内放置一个岛屿中心点
 * 3. 添加随机偏移增加自然感
 * 
 * @param {number} W - 地图宽度
 * @param {number} H - 地图高度
 * @param {number} n - 需要放置的点数
 * @param {object} rng - 随机数生成器
 * @param {number} margin - 边缘留白
 * @returns {number[][]} 中心点数组 [[x,y], ...]
 */
function spreadPoints(W, H, n, rng, margin) {
  // 计算网格行列数（尽量接近正方形）
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * W) / H)));
  const rows = Math.ceil(n / cols);
  
  // 生成网格单元格索引并打乱
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([r, c]);
    }
  }
  rng.shuffle(cells);
  
  // 在每个网格内放置点
  const pts = [];
  for (let i = 0; i < n; i++) {
    const [r, c] = cells[i % cells.length];
    const cw = Math.floor(W / cols);
    const ch = Math.floor(H / rows);
    
    const x = clamp(
      c * cw + rng.int(margin, Math.max(margin + 1, cw - margin)),
      margin,
      W - margin - 1
    );
    const y = clamp(
      r * ch + rng.int(margin, Math.max(margin + 1, ch - margin)),
      margin,
      H - margin - 1
    );
    pts.push([x, y]);
  }
  return pts;
}

/**
 * 从岛屿中选择分布均匀的特征点
 * 
 * 算法：空间哈希均匀选取
 * 1. 将岛屿划分为多个桶（cell size 根据岛屿面积计算）
 * 2. 每个桶随机选择一个点
 * 3. 不足时从剩余陆地随机补充
 * 
 * @param {number[][]} landCells - 所有陆地单元格 [[x,y], ...]
 * @param {number} m - 需要选择的点数
 * @param {object} rng - 随机数生成器
 * @returns {number[][]} 选中的点
 */
function pickLandPoints(landCells, m, rng) {
  if (!landCells.length) return [];
  if (m >= landCells.length) return landCells.slice();
  
  // 计算桶大小（根据岛屿面积和目标数量调整）
  const cellSize = Math.max(1, Math.floor(Math.sqrt(landCells.length / m)));
  const buckets = {};
  
  // 哈希分桶
  for (const [x, y] of landCells) {
    const k = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push([x, y]);
  }
  
  // 每个桶选一个点
  const keys = Object.keys(buckets);
  rng.shuffle(keys);
  const chosen = [];
  for (let i = 0; i < Math.min(m, keys.length); i++) {
    const b = buckets[keys[i]];
    chosen.push(b[rng.int(0, b.length)]);
  }
  
  // 不足时随机补充
  while (chosen.length < m && chosen.length < landCells.length) {
    const e = landCells[rng.int(0, landCells.length)];
    if (!chosen.some(p => p[0] === e[0] && p[1] === e[1])) {
      chosen.push(e);
    }
  }
  return chosen;
}

// ============================================
// 岛屿放置（带碰撞检测）
// ============================================

/**
 * 放置岛屿中心点（带碰撞检测）
 * 
 * 算法：
 * 1. 先随机生成所有岛屿的半径
 * 2. 使用网格分区初步布局
 * 3. 对每个岛屿检测与已有岛屿的碰撞
 * 4. 有碰撞则重新选择位置（最多80次尝试）
 * 
 * @param {number} W - 地图宽度
 * @param {number} H - 地图高度
 * @param {number} ni - 岛屿数量
 * @param {object} rng - 随机数生成器
 * @param {number} ri0 - 岛屿半径最小值
 * @param {number} ri1 - 岛屿半径最大值
 * @returns {{centers: number[][], radii: number[]}} 岛屿中心和半径
 */
function placeIslands(W, H, ni, rng, ri0, ri1) {
  const islandRadii = [];
  for (let i = 0; i < ni; i++) {
    islandRadii.push(rng.int(ri0, ri1 + 1));
  }
  
  const islandCenters = [];
  const margin = ri1 + 2;
  
  // 网格分区初始化
  const cols = Math.max(1, Math.ceil(Math.sqrt((ni * W) / H)));
  const rows = Math.ceil(ni / cols);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([r, c]);
    }
  }
  rng.shuffle(cells);
  
  // 逐个放置岛屿
  for (let i = 0; i < ni; i++) {
    const r = islandRadii[i];
    const sep = r + ri1 + 4; // 最小圆心距
    let placed = false;
    
    // 最多80次尝试
    for (let attempt = 0; attempt < 80; attempt++) {
      let cx, cy;
      
      if (attempt < 20) {
        // 前20次：网格分区 + 随机偏移
        const [gr, gc] = cells[i % cells.length];
        const cw = Math.floor(W / cols);
        const ch = Math.floor(H / rows);
        const jx = rng.int(0, cw);
        const jy = rng.int(0, ch);
        cx = clamp(gc * cw + jx, r + 2, W - r - 3);
        cy = clamp(gr * ch + jy, r + 2, H - r - 3);
      } else {
        // 后续：完全随机
        cx = rng.int(r + 2, W - r - 3);
        cy = rng.int(r + 2, H - r - 3);
      }
      
      // 碰撞检测
      let ok = true;
      for (let j = 0; j < islandCenters.length; j++) {
        const [px, py] = islandCenters[j];
        const minDist = islandRadii[j] + r + 3;
        if ((cx - px) ** 2 + (cy - py) ** 2 < minDist * minDist) {
          ok = false;
          break;
        }
      }
      
      if (ok) {
        islandCenters.push([cx, cy]);
        placed = true;
        break;
      }
    }
    
    // 未能放置则强制放置（兜底）
    if (!placed) {
      const [gr, gc] = cells[i % cells.length];
      const cw = Math.floor(W / cols);
      const ch = Math.floor(H / rows);
      const cx = clamp(
        gc * cw + rng.int(r + 2, Math.max(r + 3, cw - r)),
        r + 2,
        W - r - 3
      );
      const cy = clamp(
        gr * ch + rng.int(r + 2, Math.max(r + 3, ch - r)),
        r + 2,
        H - r - 3
      );
      islandCenters.push([cx, cy]);
    }
  }
  
  return { centers: islandCenters, radii: islandRadii };
}

// ============================================
// 地图生成主函数
// ============================================

/**
 * 从 DOM 获取输入值
 * @param {string} id - 元素 ID
 * @returns {number} 输入值
 */
function getVal(id) {
  return +document.getElementById(id).value;
}

/**
 * 生成地图主函数
 * 
 * 完整流程：
 * 1. 初始化网格和 RNG
 * 2. 放置岛屿（碰撞检测）
 * 3. 生成山峰（覆盖陆地）
 * 4. 生成湖泊（覆盖陆地）
 * 5. 生成森林（覆盖陆地）
 * 6. 渲染到 Canvas
 */
function generate() {
  // ===== 1. 获取参数 =====
  const W = getVal('mw');
  const H = getVal('mh');
  const tile = getVal('tile');
  const seed = getVal('seed');
  const ni = getVal('ni');
  const nm = getVal('nm');
  const nx = getVal('nx');
  const ny = getVal('ny');
  const ri0 = getVal('ri0');
  const ri1 = Math.max(getVal('ri1'), ri0);
  const rm0 = getVal('rm0');
  const rm1 = Math.max(getVal('rm1'), rm0);
  const rx0 = getVal('rx0');
  const rx1 = Math.max(getVal('rx1'), rx0);
  const ry0 = getVal('ry0');
  const ry1 = Math.max(getVal('ry1'), ry0);
  
  // ===== 2. 初始化 =====
  const rng = seededRng(seed);
  // 使用 Uint8Array 优化内存（每个单元格只需1字节）
  const grid = Array.from({ length: H }, () => new Uint8Array(W));
  
  // ===== 3. 放置岛屿 =====
  const { centers: islandCenters, radii: islandRadii } = 
    placeIslands(W, H, ni, rng, ri0, ri1);
  
  // 生成并填充岛屿多边形
  for (let i = 0; i < ni; i++) {
    const [cx, cy] = islandCenters[i];
    const r = islandRadii[i];
    const poly = genPoly(cx, cy, r, 80, 0.09, rng);
    fillPoly(grid, W, H, poly, LAND);
  }
  
  // ===== 4. 构建陆地遮罩（用于特征生成） =====
  const landMask = Array.from({ length: H }, () => new Uint8Array(W));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === LAND) landMask[y][x] = 1;
    }
  }
  
  // ===== 5. 生成山峰（层级1：只覆盖普通陆地） =====
  let landCells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === LAND) landCells.push([x, y]);
    }
  }
  
  const mPts = pickLandPoints(landCells, nm, rng);
  for (const [cx, cy] of mPts) {
    const r = rng.int(rm0, rm1 + 1);
    const poly = genPoly(cx, cy, r, 48, 0.13, rng);
    fillPoly(grid, W, H, poly, MOUNTAIN, LAND); // 只覆盖 LAND
  }
  
  // ===== 6. 生成湖泊（层级2：只覆盖普通陆地） =====
  landCells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === LAND) landCells.push([x, y]);
    }
  }
  
  const lPts = pickLandPoints(landCells, nx, rng);
  for (const [cx, cy] of lPts) {
    const r = rng.int(rx0, rx1 + 1);
    const poly = genPoly(cx, cy, r, 40, 0.15, rng);
    fillPoly(grid, W, H, poly, LAKE, LAND); // 只覆盖 LAND
  }
  
  // ===== 7. 生成森林（层级3：只覆盖普通陆地） =====
  landCells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === LAND) landCells.push([x, y]);
    }
  }
  
  const fPts = pickLandPoints(landCells, ny, rng);
  for (const [cx, cy] of fPts) {
    const r = rng.int(ry0, ry1 + 1);
    const poly = genPoly(cx, cy, r, 48, 0.1, rng);
    fillPoly(grid, W, H, poly, FOREST, LAND); // 只覆盖 LAND
  }
  
  // ===== 8. 渲染 =====
  const canvas = document.getElementById('map');
  canvas.width = W * tile;
  canvas.height = H * tile;
  const ctx = canvas.getContext('2d');
  
  // 绘制每个单元格
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = COLORS[grid[y][x]];
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }
  
  // ===== 9. 边缘阴影（可选，仅大像素时启用） =====
  if (tile >= 5) {
    ctx.globalAlpha = 0.14;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== OCEAN) {
          // 左上边缘：白色高光
          if (grid[y - 1][x] === OCEAN || grid[y][x - 1] === OCEAN) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x * tile, y * tile, tile, tile);
          }
          // 右下边缘：黑色阴影
          if (grid[y + 1][x] === OCEAN || grid[y][x + 1] === OCEAN) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(x * tile, y * tile, tile, tile);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    
    // 绘制岛屿中心点标记
    ctx.fillStyle = 'rgba(255,220,80,0.8)';
    for (const [cx, cy] of islandCenters) {
      ctx.beginPath();
      ctx.arc(cx * tile + tile / 2, cy * tile + tile / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // ===== 10. 统计信息 =====
  let counts = [0, 0, 0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      counts[grid[y][x]]++;
    }
  }
  const total = W * H;
  const landPercent = ((counts[1] + counts[2] + counts[3] + counts[4]) / total * 100).toFixed(1);
  document.getElementById('stats').innerHTML =
    `陆地 Land ${landPercent}%<br>` +
    `山 Mtn ${counts[2]} · 湖 Lake ${counts[3]} · 林 Forest ${counts[4]}`;
}

/**
 * 生成随机种子并重新生成地图
 */
function randomSeed() {
  document.getElementById('seed').value = Math.floor(Math.random() * 99999);
  generate();
}

// ============================================
// 初始化 / Initialization
// ============================================

// 页面加载完成后绑定事件并生成初始地图
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('generateBtn').addEventListener('click', generate);
  document.getElementById('randomSeedBtn').addEventListener('click', randomSeed);
  
  // 生成初始地图
  generate();
});
