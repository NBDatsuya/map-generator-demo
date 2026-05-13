// ---------------------------
// Island Map Generator
// Main JavaScript
// 岛屿地图生成器 - 主脚本
// ---------------------------

// Constants for island generation defaults
// 岛屿生成的默认常量
const ISLAND_CONFIG = {
  BASE_RADIUS: 35, // Base radius for first island / 第一个岛屿的基础半径
  RADIUS_DECAY: 4, // Radius decrease per island / 每个岛屿的半径递减量
  MIN_RADIUS: 10, // Minimum radius for any island / 任何岛屿的最小半径
};

// Disable mouse wheel on number inputs - prevent default to allow panel scrolling
// 屏蔽 number input 的鼠标滚轮事件，让父元素处理滚动
document.querySelectorAll('input[type="number"]').forEach((input) => {
  input.addEventListener(
    "wheel",
    (e) => {
      // Prevent the default behavior (changing the number value)
      // 阻止默认行为（改变数值），让事件继续传播到父元素实现 panel 滚动
      e.preventDefault();
    },
    { passive: false },
  );
});

// Update value displays for range sliders
// 更新滑块的数值显示
document.querySelectorAll('input[type="range"]').forEach((input) => {
  const display = document.getElementById(input.id + "Value");
  if (display) {
    input.addEventListener("input", () => {
      display.textContent = input.value;
    });
  }
});

// Update radii hint when island count changes
// 当岛屿数量变化时更新半径提示
function updateRadiiHint() {
  const numIslands = parseInt(document.getElementById("numIslands").value) || 1;
  const hint = document.getElementById("radiiHint");
  const radiiInput = document.getElementById("radii");

  // Generate default radii based on island count
  // 根据岛屿数量生成默认半径
  let defaultRadii;
  if (numIslands === 1) {
    defaultRadii = String(ISLAND_CONFIG.BASE_RADIUS);
  } else {
    const radii = [];
    for (let i = 0; i < numIslands; i++) {
      radii.push(
        Math.max(
          ISLAND_CONFIG.MIN_RADIUS,
          ISLAND_CONFIG.BASE_RADIUS - i * ISLAND_CONFIG.RADIUS_DECAY,
        ),
      );
    }
    defaultRadii = radii.join(",");
  }

  // Update hint text
  hint.textContent = `Default: ${defaultRadii}`;

  // If user hasn't manually changed the radii field, update it
  // 如果用户没有手动修改半径字段，则更新它
  if (!radiiInput.dataset.userModified) {
    radiiInput.value = defaultRadii;
  }
}

// Track if user has manually modified the radii field
// 追踪用户是否手动修改了半径字段
document.getElementById("radii").addEventListener("input", function () {
  this.dataset.userModified = "true";
});

// Initialize on page load
// 页面加载时初始化
updateRadiiHint();

// Update hint when island count changes
// 当岛屿数量变化时更新提示
document
  .getElementById("numIslands")
  .addEventListener("change", updateRadiiHint);
document
  .getElementById("numIslands")
  .addEventListener("input", updateRadiiHint);

// Handle form submission
// 处理表单提交
document.getElementById("mapForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = document.getElementById("generateBtn");
  const btnText = btn.querySelector(".btn-text");
  const btnLoading = btn.querySelector(".btn-loading");

  // Show loading state
  // 显示加载状态
  btn.disabled = true;
  btnText.style.display = "none";
  btnLoading.style.display = "inline";

  const mapContainer = document.getElementById("mapContainer");
  mapContainer.classList.add("loading");

  // Get current form values directly from DOM
  // 直接从 DOM 获取当前表单值
  const widthVal = document.getElementById("width").value;
  const heightVal = document.getElementById("height").value;
  const seedVal = document.getElementById("seed").value;
  const numIslandsVal = document.getElementById("numIslands").value;
  const radiiVal = document.getElementById("radii").value;
  const environmentsVal = document.getElementById("environments").value;
  const baseSwitchVal = document.getElementById("baseSwitch").value;
  const switchGrowthVal = document.getElementById("switchGrowth").value;
  const adjacencyBiasVal = document.getElementById("adjacencyBias").value;
  const cohesionBiasVal = document.getElementById("cohesionBias").value;

  // Collect form data
  // 收集表单数据
  const formData = {
    width: parseInt(widthVal) || 100,
    height: parseInt(heightVal) || 80,
    seed: seedVal ? parseInt(seedVal) : null,
    num_islands: parseInt(numIslandsVal) || 1,
    radii: radiiVal || "35",
    environments: environmentsVal || "forest:5, plains:3, water:2, mountain:1",
    base_switch: parseFloat(baseSwitchVal) || 0.03,
    switch_growth: parseFloat(switchGrowthVal) || 0.0025,
    adjacency_bias: parseFloat(adjacencyBiasVal) || 0.35,
    cohesion_bias: parseFloat(cohesionBiasVal) || 0.2,
  };

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    const result = await response.json();

    if (result.success) {
      // Display map image
      // 显示地图图片
      const img = document.getElementById("mapImage");
      const placeholder = document.getElementById("placeholder");

      img.src = "data:image/png;base64," + result.image;
      img.style.display = "block";
      placeholder.style.display = "none";

      // Display legend
      // 显示图例
      const legendContainer = document.getElementById("legendContainer");
      const legendDiv = document.getElementById("legend");
      legendDiv.innerHTML = "";

      for (const [name, color] of Object.entries(result.legend)) {
        const item = document.createElement("div");
        item.className = "legend-item";

        const colorBox = document.createElement("div");
        colorBox.className = "legend-color";
        colorBox.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

        const label = document.createElement("span");
        label.className = "legend-label";
        label.textContent = name;

        item.appendChild(colorBox);
        item.appendChild(label);
        legendDiv.appendChild(item);
      }
      legendContainer.style.display = "block";

      // Display seed info
      // 显示种子信息
      const infoContainer = document.getElementById("infoContainer");
      document.getElementById("infoSeed").textContent = result.seed;
      infoContainer.style.display = "block";
    } else {
      alert("Error / 错误: " + (result.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error:", error);
    alert("Request failed. Please try again. / 请求失败，请重试。");
  } finally {
    // Reset button state
    // 重置按钮状态
    btn.disabled = false;
    btnText.style.display = "inline";
    btnLoading.style.display = "none";
    mapContainer.classList.remove("loading");
  }
});
