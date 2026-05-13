# Island Map Generator - Flask Version

# 岛屿地图生成器 - Flask 版本

> A refactored version of the original `simple_demo.py` with a modern web interface.
> 重构版本的 `simple_demo.py`，带有现代化的网页界面。
>
> Prototype by Nate

## Features / 功能特点

- 🗺️ **Procedural Island Generation** - Generate connected island chains with natural shapes
- 🎨 **Environment Zones** - Multi-seed flood fill for natural environment distribution
- 🎛️ **Interactive Controls** - Real-time parameter adjustment via web sliders
- 📱 **Responsive Design** - Works on desktop and mobile
- 🌐 **Web-based** - No installation needed, runs in browser

## Quick Start / 快速开始

### 1. Install Dependencies / 安装依赖

```bash
cd pygame-map-generator
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

### 2. Run the Application / 运行应用

```bash
python app.py
```

### 3. Open in Browser / 在浏览器中打开

Navigate to: http://localhost:5000

## Project Structure / 项目结构

```
pygame-map-generator/
├── app.py              # Flask application / Flask 应用
├── generator.py         # Core generation logic / 核心生成逻辑
├── simple_demo.py       # Original CLI version / 原始命令行版本
├── requirements.txt     # Python dependencies / Python 依赖
├── templates/
│   └── index.html      # Main page template / 主页面模板
└── static/
    ├── css/
    │   └── style.css   # Styles / 样式
    └── js/
        └── main.js      # Frontend logic / 前端逻辑
```

## Parameters / 参数说明

### Map Settings / 地图设置

| Parameter | Description                          | Default |
| --------- | ------------------------------------ | ------- |
| `Width`   | Map width (cells)                    | 100     |
| `Height`  | Map height (cells)                   | 80      |
| `Seed`    | Random seed (leave empty for random) | Random  |

### Island Settings / 岛屿设置

| Parameter | Description                                    | Default |
| --------- | ---------------------------------------------- | ------- |
| `Number`  | Number of islands                              | 1       |
| `Radii`   | Island radii (comma-separated or single value) | 35      |

### Environment Settings / 环境设置

| Parameter         | Description                                              | Default                                 |
| ----------------- | -------------------------------------------------------- | --------------------------------------- |
| `Types & Weights` | Environment types and weights (format: name:weight, ...) | forest:5, plains:3, water:2, mountain:1 |

### Advanced Settings / 高级设置

| Parameter                 | Description                                             | Default |
| ------------------------- | ------------------------------------------------------- | ------- |
| `Base Switch Probability` | Base probability for environment region to stop growing | 0.03    |
| `Switch Growth per Cell`  | Additional switch probability per cell grown            | 0.0025  |
| `Adjacency Bias`          | How much neighbors influence environment choice         | 0.35    |
| `Cohesion Bias`           | Preference for same-environment neighbors               | 0.20    |

## Algorithm Overview / 算法概述

### Island Generation - Chain Growth

### 岛屿生成 - 链式生长

1. First island placed at map center
2. Each subsequent island grows from previous island's edge
3. All islands connected via Bresenham line bridges

### Environment Generation - Multi-seed Flood Fill

### 环境生成 - 多种子洪水填充

1. Random seed cell selected from unassigned land
2. Region grows outward with controlled randomness
3. Switch probability increases with region size
4. Neighboring same-environment cells reduce switch probability

## License / 许可证

MIT License
