/**
 * ============================================
 * Island Map Generator - Controller
 * 岛屿地图生成器 - 界面控制器
 *
 * This module handles all UI interactions,
 * event listeners, and clipboard functionality.
 * ============================================
 */

import { generateMap, TERRAIN } from "./generator.js";
import {
  compressExportData,
  decompressExportData,
  compareSize,
} from "./compress.js";

// ============================================
// 状态管理 / State Management
// ============================================

/** 当前生成结果（供剪贴板复制使用） */
let currentResult = null;

/** 复制按钮状态提示 */
const COPY_SUCCESS_DURATION = 2000; // 2秒

// ============================================
// 剪贴板功能 / Clipboard Functionality
// ============================================

/**
 * 将地图数据导出为可序列化的JSON格式
 * @param {Object} result - generateMap() 返回的结果对象
 * @returns {Object} 序列化的JSON对象
 */
function exportMapData(result) {
  const { islands, W, H, seed, params } = result;

  return {
    metadata: {
      version: "v2-a2",
      exportedAt: new Date().toISOString(),
    },
    params: {
      mapSize: { width: W, height: H },
      seed: seed,
      ...params,
    },
    terrainEnum: TERRAIN,
    islands: islands,
  };
}

/**
 * 复制JSON数据到剪贴板
 * @param {Object} data - 要复制的数据对象
 * @returns {Promise<boolean>} 是否复制成功
 */
async function copyToClipboard(data) {
  try {
    const jsonString = JSON.stringify(data);
    await navigator.clipboard.writeText(jsonString);
    return true;
  } catch (err) {
    console.error("复制到剪贴板失败:", err);
    // 降级方案：使用传统的 execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = JSON.stringify(data);
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    } catch (fallbackErr) {
      console.error("降级复制也失败:", fallbackErr);
      return false;
    }
  }
}

/**
 * 显示复制成功提示
 * @param {HTMLElement} button - 复制按钮元素
 */
async function showCopySuccess(button) {
  const originalText = button.innerHTML;
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    已复制 ✓
  `;
  button.classList.add("copy-success");

  setTimeout(() => {
    button.innerHTML = originalText;
    button.classList.remove("copy-success");
  }, COPY_SUCCESS_DURATION);
}

/**
 * 处理复制按钮点击（使用压缩）
 */
async function handleCopyToClipboard() {
  if (!currentResult) {
    alert("请先生成地图！");
    return;
  }

  const button = document.getElementById("copyBtn");
  const rawData = exportMapData(currentResult);

  // 使用压缩（islands.grid 和 vertices 已用 base64）
  const compressedData = await compressExportData(rawData);

  // 打印压缩效果（开发调试用）
  const comparison = compareSize(rawData, compressedData);
  console.log(
    `压缩效果: ${comparison.original} bytes → ${comparison.compressed} bytes (${comparison.ratio})`,
  );

  console.log(compressedData);

  const success = await copyToClipboard(compressedData);

  if (success) {
    showCopySuccess(button);
  } else {
    alert("复制失败，请手动复制");
  }
}

// ============================================
// 随机种子 / Random Seed
// ============================================

/**
 * 随机生成种子并重新生成地图
 */
function randomSeed() {
  document.getElementById("seed").value = Math.floor(Math.random() * 99999);
  currentResult = generateMap();
}

// ============================================
// 生成地图 / Generate Map
// ============================================

/**
 * 生成地图的主处理函数
 */
function handleGenerate() {
  currentResult = generateMap();
}

// ============================================
// 初始化 / Initialization
// ============================================

/**
 * 初始化所有事件监听器
 */
function init() {
  // 生成按钮
  const generateBtn = document.getElementById("generateBtn");
  if (generateBtn) {
    generateBtn.addEventListener("click", handleGenerate);
  }

  // 随机种子按钮
  const randomSeedBtn = document.getElementById("randomSeedBtn");
  if (randomSeedBtn) {
    randomSeedBtn.addEventListener("click", randomSeed);
  }

  // 复制按钮
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", handleCopyToClipboard);
  }

  // 初始生成
  currentResult = generateMap();
}

const getCurrentResult = () => currentResult;

// ============================================
// 导出 / Export
// ============================================

export {
  init,
  handleGenerate,
  randomSeed,
  handleCopyToClipboard,
  exportMapData,
  getCurrentResult,
};
