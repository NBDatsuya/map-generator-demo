/**
 * ============================================
 * Island Map Generator - Compression Module
 * 岛屿地图生成器 - 数据压缩模块
 *
 * 提供高效的数据压缩/解压缩功能
 * ============================================
 */

/**
 * 压缩选项
 */
export const COMPRESS_OPTIONS = {
  /** 顶点坐标精度（小数位数） */
  VERTEX_PRECISION: 2,
  /** 启用 RLE 压缩 */
  USE_RLE: true,
  /** 启用增量编码 */
  USE_DELTA: true,
};

/**
 * ============================================
 * 辅助函数
 * ============================================
 */

/**
 * 将数字固定小数位数
 */
function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * 数组转 base64
 */
function arrayToBase64(arr) {
  const bytes = new Uint8Array(arr);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * base64 转数组
 */
function base64ToArray(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return Array.from(bytes);
}

/**
 * 使用 gzip 压缩后转 base64
 */
async function arrayToGzipBase64(arr) {
  const bytes = new Uint8Array(arr);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return arrayToBase64(Array.from(result));
}

/**
 * base64 转 gzip 数组
 */
async function gzipBase64ToArray(base64) {
  const bytes = new Uint8Array(base64ToArray(base64));
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return Array.from(result);
}

/**
 * ============================================
 * RLE（游程编码）
 * ============================================
 */

/**
 * RLE 编码 - 适合大面积相似数据（如海洋地图）
 * 原始：[0,0,0,0,1,1,2,2,2,0,0,0]
 * 编码：[[0,4],[1,2],[2,3],[0,3]]
 */
export function encodeRLE(arr) {
  if (!arr.length) return [];

  const result = [];
  let current = arr[0];
  let count = 1;

  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === current) {
      count++;
    } else {
      result.push([current, count]);
      current = arr[i];
      count = 1;
    }
  }
  result.push([current, count]);

  return result;
}

/**
 * RLE 解码
 */
export function decodeRLE(encoded) {
  const result = [];
  for (const [value, count] of encoded) {
    for (let i = 0; i < count; i++) {
      result.push(value);
    }
  }
  return result;
}

/**
 * ============================================
 * 坐标压缩（稀疏数据）
 * ============================================
 */

/**
 * 坐标数组压缩 - 适合稀疏数据
 * 原始：[[0,0,1],[0,1,1],[0,2,1],[5,5,2]]
 * 编码：{minX, minY, data: [[0,0,1,0,1,1,0,2,1,5,5,2]]}
 *
 * @param {Array} coords - [[x, y, value], ...] 格式
 * @param {number} maxX - 最大 X 坐标（用于计算差分）
 * @param {number} maxY - 最大 Y 坐标
 */
export function encodeCoordinates(coords, maxX = 0, maxY = 0) {
  if (!coords.length) {
    return { count: 0, data: [] };
  }

  // 找到边界
  let minX = Infinity, minY = Infinity;
  let maxValX = 0, maxValY = 0;

  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxValX = Math.max(maxValX, x);
    maxValY = Math.max(maxValY, y);
  }

  // 计算需要的位数
  const rangeX = maxValX - minX;
  const rangeY = maxValY - minY;

  // 使用差分编码
  let prevX = 0, prevY = 0;
  const data = [];

  for (const [x, y, ...rest] of coords) {
    const dx = x - prevX;
    const dy = y - prevY;
    data.push(dx, dy, ...rest);
    prevX = x;
    prevY = y;
  }

  return {
    count: coords.length,
    minX,
    minY,
    data,  // [dx1, dy1, ...values, dx2, dy2, ...values]
  };
}

/**
 * 坐标数组解压
 */
export function decodeCoordinates(encoded) {
  if (!encoded.count) return [];

  const result = [];
  let x = encoded.minX;
  let y = encoded.minY;
  let idx = 0;

  while (idx < encoded.data.length) {
    x += encoded.data[idx++];
    y += encoded.data[idx++];

    // 读取剩余的值（type 等）
    const rest = [];
    while (idx < encoded.data.length && typeof encoded.data[idx] === 'number') {
      rest.push(encoded.data[idx++]);
    }

    result.push([x, y, ...rest]);
  }

  return result;
}

/**
 * ============================================
 * 二进制打包
 * ============================================
 */

/**
 * 将小整数数组打包为字节数组
 * 假设所有值都在 0-255 范围内
 *
 * @param {number[]} arr - 整数数组
 * @returns {Uint8Array}
 */
export function packBytes(arr) {
  return new Uint8Array(arr);
}

/**
 * 将字节数组解包为整数数组
 */
export function unpackBytes(bytes) {
  return Array.from(bytes);
}

/**
 * ============================================
 * 地图网格专用压缩
 * ============================================
 */

/**
 * 压缩全局地图网格
 *
 * 策略：
 * 1. 如果非零值稀疏度高 → 使用坐标压缩
 * 2. 如果非零值稀疏度低 → 使用 RLE
 * 3. 优先选择更小的结果
 *
 * @param {Array<Array<number>>} grid - 二维网格
 * @param {number} defaultValue - 默认填充值（通常是 0）
 * @returns {Object} 压缩后的数据
 */
export function compressGrid(grid, defaultValue = 0) {
  const H = grid.length;
  const W = H > 0 ? grid[0].length : 0;

  // 统计非默认值的数量
  const nonDefault = [];
  const defaultCount = { count: 0 };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const val = grid[y][x];
      if (val !== defaultValue) {
        nonDefault.push([x, y, val]);
      } else {
        defaultCount.count++;
      }
    }
  }

  const totalCells = W * H;
  const nonDefaultRatio = nonDefault.length / totalCells;

  // 选择压缩策略
  if (nonDefaultRatio < 0.3) {
    // 稀疏数据：使用坐标压缩
    const coordEncoded = encodeCoordinates(nonDefault, W, H);
    return {
      format: 'sparse',
      width: W,
      height: H,
      defaultValue,
      ...coordEncoded,
    };
  } else if (nonDefaultRatio < 0.7) {
    // 中等密度：使用 RLE
    // 将二维转一维
    const flat = grid.flat();

    // 尝试 RLE
    const rleEncoded = encodeRLE(flat);

    // 估算大小
    const rleSize = JSON.stringify(rleEncoded).length;
    const rawSize = flat.length;

    if (rleSize < rawSize * 0.8) {
      return {
        format: 'rle',
        width: W,
        height: H,
        defaultValue,
        data: rleEncoded,
      };
    } else {
      // RLE 效果不好，直接用原始数据打包
      return {
        format: 'packed',
        width: W,
        height: H,
        data: Array.from(packBytes(flat)),
      };
    }
  } else {
    // 高密度：直接打包
    const flat = grid.flat();
    return {
      format: 'packed',
      width: W,
      height: H,
      data: Array.from(packBytes(flat)),
    };
  }
}

/**
 * 解压全局地图网格
 */
export function decompressGrid(compressed) {
  const { format, width, height, defaultValue = 0 } = compressed;

  switch (format) {
    case 'sparse': {
      const grid = Array.from({ length: height }, () =>
        new Array(width).fill(defaultValue)
      );
      const coords = decodeCoordinates(compressed);
      for (const [x, y, val] of coords) {
        grid[y][x] = val;
      }
      return grid;
    }

    case 'rle': {
      const flat = decodeRLE(compressed.data);
      const grid = [];
      for (let y = 0; y < height; y++) {
        grid.push(flat.slice(y * width, (y + 1) * width));
      }
      return grid;
    }

    case 'packed': {
      const bytes = new Uint8Array(compressed.data);
      const grid = [];
      for (let y = 0; y < height; y++) {
        grid.push(Array.from(bytes.slice(y * width, (y + 1) * width)));
      }
      return grid;
    }

    default:
      throw new Error(`Unknown compression format: ${format}`);
  }
}

/**
 * ============================================
 * 岛屿数据压缩
 * ============================================
 */

/**
 * 压缩岛屿网格（使用 gzip + base64）
 *
 * @param {Array} grid - [[x, y, type], ...]
 * @returns {Object} 压缩后的数据
 */
export async function compressIslandGrid(grid) {
  if (!grid.length) return { count: 0, data: "" };

  // 找到边界
  let minX = Infinity, minY = Infinity;
  for (const [x, y] of grid) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }

  // 增量编码
  let prevX = 0, prevY = 0;
  const data = [];

  for (const [x, y, type] of grid) {
    const dx = x - prevX;
    const dy = y - prevY;
    data.push(dx, dy, type);
    prevX = x;
    prevY = y;
  }

  // gzip 压缩后转 base64
  const base64 = await arrayToGzipBase64(data);

  return {
    minX,
    minY,
    count: grid.length,
    data: base64
  };
}

/**
 * 解压岛屿网格
 */
export async function decompressIslandGrid(compressed) {
  if (!compressed.count) return [];

  const result = [];
  let x = compressed.minX;
  let y = compressed.minY;
  const data = compressed.gzip
    ? await gzipBase64ToArray(compressed.data)
    : base64ToArray(compressed.data);

  for (let i = 0; i < data.length; i += 3) {
    x += data[i];
    y += data[i + 1];
    const type = data[i + 2];
    result.push([x, y, type]);
  }

  return result;
}

/**
 * ============================================
 * 顶点数据压缩
 * ============================================
 */

/**
 * 压缩顶点数组（使用 gzip + base64）
 *
 * @param {Array} vertices - [[x, y], ...]
 * @param {number} precision - 小数位数
 * @returns {Object} 压缩后的数据
 */
export async function compressVertices(vertices, precision = COMPRESS_OPTIONS.VERTEX_PRECISION) {
  if (!vertices.length) return { count: 0, data: "" };

  // 量化坐标到整数
  const quantized = vertices.map(([x, y]) => [
    Math.round(x * Math.pow(10, precision)),
    Math.round(y * Math.pow(10, precision)),
  ]);

  // 增量编码
  let prevX = 0, prevY = 0;
  const data = [];

  for (const [x, y] of quantized) {
    const dx = x - prevX;
    const dy = y - prevY;
    data.push(dx, dy);
    prevX = x;
    prevY = y;
  }

  // gzip 压缩后转 base64
  const base64 = await arrayToGzipBase64(data);

  return {
    precision,
    count: vertices.length,
    minX: quantized[0][0],
    minY: quantized[0][1],
    data: base64
  };
}

/**
 * 解压顶点数组
 */
export async function decompressVertices(compressed) {
  if (!compressed.count) return [];

  const { precision, minX, minY, data } = compressed;
  const factor = Math.pow(10, precision);
  const result = [];
  let x = minX;
  let y = minY;
  const arr = compressed.gzip
    ? await gzipBase64ToArray(data)
    : base64ToArray(data);

  for (let i = 0; i < arr.length; i += 2) {
    x += arr[i];
    y += arr[i + 1];
    result.push([x / factor, y / factor]);
  }

  return result;
}

/**
 * ============================================
 * 完整导出数据压缩
 * ============================================
 */

/**
 * 压缩完整的地图导出数据（不含 fullGrid，只压缩 islands）
 *
 * @param {Object} exportData - exportMapData() 返回的数据
 * @returns {Object} 压缩后的数据
 */
export async function compressExportData(exportData) {
  const { metadata, params, terrainEnum, islands } = exportData;

  // 压缩每个岛屿的 vertices 和 grid（async）
  const compressedIslands = await Promise.all(
    islands.map(async (island) => ({
      id: island.id,
      centerX: island.centerX,
      centerY: island.centerY,
      radius: island.radius,
      collisionRadius: island.collisionRadius,
      offsetX: island.offsetX,
      offsetY: island.offsetY,
      width: island.width,
      height: island.height,
      vertices: await compressVertices(island.vertices),
      grid: await compressIslandGrid(island.grid),
    }))
  );

  return {
    metadata: {
      ...metadata,
      compressed: true,
      compressFormat: 'v1',
    },
    params,
    terrainEnum,
    islands: compressedIslands,
  };
}

/**
 * 解压完整的地图导出数据
 */
export async function decompressExportData(compressed) {
  const { metadata, params, terrainEnum, islands } = compressed;

  // 解压每个岛屿
  const decompressedIslands = await Promise.all(
    islands.map(async (island) => ({
      id: island.id,
      centerX: island.centerX,
      centerY: island.centerY,
      radius: island.radius,
      collisionRadius: island.collisionRadius,
      offsetX: island.offsetX,
      offsetY: island.offsetY,
      width: island.width,
      height: island.height,
      vertices: await decompressVertices(island.vertices),
      grid: await decompressIslandGrid(island.grid),
    }))
  );

  return {
    metadata: {
      ...metadata,
      compressed: false,
    },
    params,
    terrainEnum,
    islands: decompressedIslands,
  };
}

/**
 * ============================================
 * 大小对比工具
 * ============================================
 */

/**
 * 比较压缩前后的数据大小
 */
export function compareSize(original, compressed) {
  const originalSize = JSON.stringify(original).length;
  const compressedSize = JSON.stringify(compressed).length;

  return {
    original: originalSize,
    compressed: compressedSize,
    ratio: (compressedSize / originalSize * 100).toFixed(1) + '%',
    saved: originalSize - compressedSize,
  };
}
