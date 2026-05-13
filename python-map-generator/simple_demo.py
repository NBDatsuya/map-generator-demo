# ---------------------------
# A simple demo by Nate
# 一个简单的演示 by Nate
# ---------------------------   

import math
import random
from collections import Counter

import pygame



# -----------------------------
# Helper functions
# 辅助函数
# -----------------------------

def clamp(value, lo, hi):
    """
    Clamp a value between a lower and upper bound.
    将值限制在指定范围内（下限和上限之间）。
    
    Args:
        value: 要限制的值 / The value to clamp
        lo: 下限 / Lower bound
        hi: 上限 / Upper bound
    
    Returns:
        限制后的值 / The clamped value
    """
    return max(lo, min(hi, value))

def ask_int(prompt, default):
    """
    Prompt user for an integer input, returning default if empty.
    提示用户输入整数，如果为空则返回默认值。
    
    Args:
        prompt: 提示信息 / Prompt message
        default: 默认值 / Default value
    
    Returns:
        用户输入的整数或默认值 / User input integer or default
    """
    raw = input(f"{prompt} [{default}]: ").strip()
    return int(raw) if raw else default

def ask_float(prompt, default):
    """
    Prompt user for a float input, returning default if empty.
    提示用户输入浮点数，如果为空则返回默认值。
    
    Args:
        prompt: 提示信息 / Prompt message
        default: 默认值 / Default value
    
    Returns:
        用户输入的浮点数或默认值 / User input float or default
    """
    raw = input(f"{prompt} [{default}]: ").strip()
    return float(raw) if raw else default

def parse_radii(text, num_islands):
    """
    Parse island radii from comma-separated string.
    将逗号分隔的字符串解析为岛屿半径列表。
    
    支持两种格式：
    - 单个值：所有岛屿使用相同的半径 / Single value: all islands use the same radius
    - 多个值：每个岛屿对应一个半径 / Multiple values: each island has its own radius
    
    Args:
        text: 逗号分隔的半径字符串 / Comma-separated radii string
        num_islands: 岛屿数量 / Number of islands
    
    Returns:
        半径列表 / List of radii
    
    Raises:
        ValueError: 半径数量与岛屿数量不匹配时 / When radius count doesn't match island count
    """
    parts = [p.strip() for p in text.split(",") if p.strip()]
    radii = [int(p) for p in parts]
    if len(radii) == 1 and num_islands > 1:
        # 单个半径值时，复制到所有岛屿 / Duplicate single radius for all islands
        radii = radii * num_islands
    if len(radii) != num_islands:
        raise ValueError("Number of radii must match number of islands, or be a single value to repeat.")
    return radii

def parse_envs(text):
    """
    Parse environment types and weights from format "name:weight, name:weight, ...".
    从 "名称:权重, 名称:权重, ..." 格式解析环境类型和权重。
    
    Args:
        text: 环境类型和权重字符串 / Environment types and weights string
    
    Returns:
        环境项列表 [(name, weight), ...] / List of environment items [(name, weight), ...]
    
    Raises:
        ValueError: 格式错误时 / When format is invalid
    """
    items = []
    for chunk in text.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            raise ValueError("Environment format must be name:weight, name:weight, ...")
        name, weight = chunk.split(":", 1)
        name = name.strip()
        weight = float(weight.strip())
#        if weight <= 0:
#            raise ValueError("All environment weights must be > 0.")
        items.append((name, weight))
    if not items:
        raise ValueError("You must provide at least one environment type.")
    return items

def normalize_weights(items):
    """
    Normalize weights so they sum to 1.0.
    归一化权重，使它们的总和为1.0。
    
    Args:
        items: 未归一化的项列表 [(name, weight), ...] / Unnormalized items [(name, weight), ...]
    
    Returns:
        归一化后的项列表 / Normalized items
    """
    total = sum(w for _, w in items)
    return [(name, w / total) for name, w in items]

def weighted_choice(rng, items):
    """
    Perform weighted random selection.
    执行加权随机选择。
    
    Args:
        rng: 随机数生成器 / Random number generator
        items: 加权项列表 [(name, weight), ...] / Weighted items [(name, weight), ...]
    
    Returns:
        选中的项名称 / Selected item name
    """
    total = sum(weight for _, weight in items)
    r = rng.random() * total
    upto = 0.0
    for thing, weight in items:
        upto += weight
        if upto >= r:
            return thing
    return items[-1][0]

def neighbors4(x, y, width, height):
    """
    Get 4-directional neighbors (up, down, left, right) within grid bounds.
    获取网格中一个位置的4个方向邻居（上、下、左、右）。
    
    Args:
        x, y: 当前坐标 / Current coordinates
        width, height: 网格尺寸 / Grid dimensions
    
    Yields:
        有效邻居坐标 / Valid neighbor coordinates
    """
    if x > 0:
        yield x - 1, y
    if x < width - 1:
        yield x + 1, y
    if y > 0:
        yield x, y - 1
    if y < height - 1:
        yield x, y + 1

def bresenham(x0, y0, x1, y1):
    """
    Bresenham's line algorithm - generates integer points along a line.
    Bresenham直线算法 - 生成两点之间的整数点序列。
    
    This is used to draw bridges between islands.
    用于绘制岛屿之间的桥梁。
    
    Args:
        x0, y0: 起点坐标 / Starting point coordinates
        x1, y1: 终点坐标 / Ending point coordinates
    
    Returns:
        直线上的整数坐标点列表 / List of integer points along the line
    """
    """Integer line between two points."""
    points = []
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy

    while True:
        points.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return points

# -----------------------------
# Island generation
# 岛屿生成
# -----------------------------

def generate_noisy_island_polygon(center, radius, samples=96, jitter=0.08, rng=None):
    """
    Generate a noisy polygon approximating a circular island.
    生成带有噪声的多边形来近似圆形岛屿。
    
    The radius varies around the circumference using smooth noise,
    creating a more natural island shape.
    半径沿圆周变化使用平滑噪声，创建更自然的岛屿形状。
    
    Args:
        center: 岛屿中心坐标 (cx, cy) / Island center coordinates
        radius: 基础半径 / Base radius
        samples: 采样点数量（越多越精细但越慢）/ Number of sample points
        jitter: 噪声强度 / Noise intensity
        rng: 随机数生成器（可选）/ Random number generator (optional)
    
    Returns:
        多边形顶点列表 [(x, y), ...] / List of polygon vertices
    """
    if rng is None:
        rng = random.Random()

    cx, cy = center
    drift = 0.0
    points = []

    for i in range(samples):
        theta = (2.0 * math.pi * i) / samples

        # 应用噪声漂移 / Apply noise drift
        drift += rng.uniform(-jitter, jitter)
        drift *= 0.90
        local_r = radius * (1.0 + drift)
        # 限制半径变化范围 / Clamp radius variation
        local_r = clamp(local_r, radius * 0.70, radius * 1.35)

        x = cx + math.cos(theta) * local_r
        y = cy + math.sin(theta) * local_r
        points.append((x, y))

    return points

def point_in_polygon(x, y, poly):
    """
    Check if a point is inside a polygon using ray casting algorithm.
    使用光线投射算法检查点是否在多边形内部。
    
    Args:
        x, y: 待检测坐标 / Coordinates to check
        poly: 多边形顶点列表 / Polygon vertices
    
    Returns:
        点是否在多边形内 / Whether point is inside polygon
    """
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]

        if ((y1 > y) != (y2 > y)):
            denom = (y2 - y1) if (y2 - y1) != 0 else 1e-12
            x_intersect = (x2 - x1) * (y - y1) / denom + x1
            if x < x_intersect:
                inside = not inside
    return inside

def fill_polygon(grid, poly, value=True):
    """
    Fill a polygon region on a 2D grid.
    在2D网格上填充多边形区域。
    
    Args:
        grid: 2D网格数组 / 2D grid array
        poly: 多边形顶点列表 / Polygon vertices
        value: 填充值 / Fill value
    """
    height = len(grid)
    width = len(grid[0])

    # 计算多边形的边界框 / Calculate bounding box of polygon
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    min_x = max(0, int(math.floor(min(xs))))
    max_x = min(width - 1, int(math.ceil(max(xs))))
    min_y = max(0, int(math.floor(min(ys))))
    max_y = min(height - 1, int(math.ceil(max(ys))))

    # 逐像素检测并填充 / Check and fill each pixel
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            if point_in_polygon(x + 0.5, y + 0.5, poly):
                grid[y][x] = value

def paint_disk(grid, cx, cy, radius, value=True):
    """
    Paint a filled disk (circle) on the grid.
    在网格上绘制实心圆（用于绘制岛屿间桥梁）。
    
    Args:
        grid: 2D网格数组 / 2D grid array
        cx, cy: 圆心坐标 / Circle center coordinates
        radius: 圆半径 / Circle radius
        value: 填充值 / Fill value
    """
    height = len(grid)
    width = len(grid[0])
    r2 = radius * radius
    for y in range(max(0, cy - radius), min(height - 1, cy + radius) + 1):
        for x in range(max(0, cx - radius), min(width - 1, cx + radius) + 1):
            if (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2:
                grid[y][x] = value

def generate_islands(width, height, radii, rng):
    """
    Generate multiple islands with bridge connections.
    生成多个岛屿并用桥梁连接。
    
    Algorithm:
    1. Start with center island / 从中心岛屿开始
    2. Each new island grows from edge of previous island
       每个新岛屿从前一个岛屿边缘生长
    3. Connect all islands with Bresenham line bridges
       用Bresenham直线连接所有岛屿
    
    Args:
        width: 地图宽度 / Map width
        height: 地图高度 / Map height
        radii: 各岛屿半径列表 / List of island radii
        rng: 随机数生成器 / Random number generator
    
    Returns:
        2D布尔网格（True=陆地，False=水域）/ 2D boolean grid (True=land, False=water)
    """
    # 初始化空白的土地网格 / Initialize empty land grid
    land = [[False for _ in range(width)] for _ in range(height)]
    island_centers = []
    island_polys = []

    prev_poly = None
    prev_center = None
    prev_radius = None

    for idx, radius in enumerate(radii):
        # 第一个岛屿放置在地图中心 / Place first island at map center
        if idx == 0:
            cx = width // 2
            cy = height // 2
            center = (cx, cy)
        else:
            # 从前一岛屿边缘随机点开始 / Start from random point on previous island edge
            border_pt = prev_poly[rng.randrange(len(prev_poly))]
            px, py = prev_center

            # 计算指向边缘点的方向向量 / Calculate direction vector toward edge point
            vx = border_pt[0] - px
            vy = border_pt[1] - py
            length = math.hypot(vx, vy) or 1.0
            vx /= length
            vy /= length

            # 添加随机角度偏移（限制在±60度以内）/ Add random angle offset (limited to ±60 degrees)
            angle = rng.uniform(-math.pi / 3.0, math.pi / 3.0)
            rx = vx * math.cos(angle) - vy * math.sin(angle)
            ry = vx * math.sin(angle) + vy * math.cos(angle)

            # 根据岛屿半径计算距离 / Calculate distance based on island radii
            dist = prev_radius * 0.85 + radius * 0.95
            cx = int(border_pt[0] + rx * dist)
            cy = int(border_pt[1] + ry * dist)

            # 确保岛屿在地图范围内 / Ensure island stays within map bounds
            cx = clamp(cx, radius + 2, width - radius - 3)
            cy = clamp(cy, radius + 2, height - radius - 3)
            center = (cx, cy)

        # 生成并填充岛屿多边形 / Generate and fill island polygon
        poly = generate_noisy_island_polygon(center, radius, samples=96, jitter=0.08, rng=rng)
        fill_polygon(land, poly, True)

        island_centers.append(center)
        island_polys.append(poly)

        prev_poly = poly
        prev_center = center
        prev_radius = radius

    # Connect islands with bridges so the whole landmass is connected
    # 连接岛屿与桥梁，使整个陆地块相连
    for i in range(1, len(island_centers)):
        x0, y0 = island_centers[i - 1]
        x1, y1 = island_centers[i]
        # 使用Bresenham算法绘制连接线 / Use Bresenham algorithm to draw connecting line
        path = bresenham(x0, y0, x1, y1)
        for x, y in path:
            paint_disk(land, x, y, radius=1, value=True)

    return land

# -----------------------------
# Environment generation
# 环境生成
# -----------------------------

def choose_environment_for_seed(seed_cell, env_weights, env_map, land, width, height, rng, adjacency_bias=0.35):
    """
    Choose environment type for a seed cell based on weights and neighbor influence.
    根据权重和邻居影响为种子单元格选择环境类型。
    
    The probability of each environment is boosted by how many neighboring
    cells already use that environment (adjacency bias).
    每种环境的概率会根据有多少邻居单元格已使用该环境而提升（邻近偏差）。
    
    Args:
        seed_cell: 种子坐标 (x, y) / Seed coordinates
        env_weights: 基础环境权重 / Base environment weights
        env_map: 当前环境分配映射 / Current environment assignment map
        land: 陆地网格 / Land grid
        width, height: 地图尺寸 / Map dimensions
        rng: 随机数生成器 / Random number generator
        adjacency_bias: 邻居影响的权重系数 / Weight coefficient for neighbor influence
    
    Returns:
        选中的环境类型名称 / Selected environment type name
    """
    nearby = Counter()
    x, y = seed_cell

    # 统计4方向邻居的环境类型 / Count environment types of 4-directional neighbors
    for nx, ny in neighbors4(x, y, width, height):
        if land[ny][nx] and (nx, ny) in env_map:
            nearby[env_map[(nx, ny)]] += 1

    # 根据邻居影响调整权重 / Adjust weights based on neighbor influence
    adjusted = []
    for name, base_weight in env_weights:
        bonus = 1.0 + adjacency_bias * nearby.get(name, 0)
        adjusted.append((name, base_weight * bonus))

    return weighted_choice(rng, adjusted)

def grow_environment_region(
    start,
    env_name,
    land,
    unassigned,
    env_map,
    width,
    height,
    rng,
    base_switch=0.03,
    switch_growth=0.0025,
    cohesion_bias=0.20,
    max_region_size=5000,
):
    """
    Grow an environment region using flood fill with controlled randomness.
    使用受控随机性的洪水填充算法扩展环境区域。
    
    The region grows outward, preferring to stay cohesive (same environment
    neighbors) but occasionally switching to create natural-looking boundaries.
    区域向外扩展，倾向于保持内聚性（相同环境的邻居），但偶尔会切换以创建自然边界。
    
    Args:
        start: 起始坐标 / Starting coordinates
        env_name: 环境类型名称 / Environment type name
        land: 陆地网格 / Land grid
        unassigned: 未分配环境的位置集合 / Set of unassigned positions
        env_map: 环境分配映射 / Environment assignment map
        width, height: 地图尺寸 / Map dimensions
        rng: 随机数生成器 / Random number generator
        base_switch: 基础切换概率 / Base switch probability
        switch_growth: 每个单元格增长的切换概率 / Switch probability growth per cell
        cohesion_bias: 内聚性偏好（减少切换概率）/ Cohesion bias (reduces switch probability)
        max_region_size: 最大区域大小 / Maximum region size
    """
    frontier = [start]
    frontier_set = {start}
    region_size = 0

    while frontier and unassigned and region_size < max_region_size:
        # 随机选择要处理的下一个单元格 / Randomly select next cell to process
        current = frontier.pop(rng.randrange(len(frontier)))
        frontier_set.discard(current)

        if current not in unassigned:
            continue

        # 分配环境类型 / Assign environment type
        env_map[current] = env_name
        unassigned.remove(current)
        region_size += 1

        x, y = current
        same_env_neighbors = 0
        assigned_neighbors = 0

        # 检查4方向邻居 / Check 4-directional neighbors
        for nx, ny in neighbors4(x, y, width, height):
            if not land[ny][nx]:
                continue
            n = (nx, ny)

            if n in env_map:
                assigned_neighbors += 1
                if env_map[n] == env_name:
                    same_env_neighbors += 1
            elif n in unassigned and n not in frontier_set:
                # 添加到扩展前沿 / Add to expansion frontier
                frontier.append(n)
                frontier_set.add(n)

        # 计算内聚性（相同环境邻居的比例）/ Calculate cohesion ratio
        cohesion = (same_env_neighbors / assigned_neighbors) if assigned_neighbors > 0 else 0.0

        # 计算切换概率 / Calculate switch probability
        switch_prob = base_switch + region_size * switch_growth - cohesion * cohesion_bias
        switch_prob = clamp(switch_prob, 0.02, 0.92)

        # 随机决定是否切换环境类型 / Randomly decide whether to switch environment type
        if rng.random() < switch_prob:
            break

def generate_environment_map(land, env_weights, rng,
                             base_switch=0.03,
                             switch_growth=0.0025,
                             adjacency_bias=0.35,
                             cohesion_bias=0.20):
    """
    Generate complete environment map for all land cells.
    为所有陆地单元格生成完整的环境地图。
    
    Uses a multi-seed flood fill approach where each seed grows
    an environment region until it naturally stops.
    使用多种子洪水填充方法，每个种子扩展一个环境区域直到自然停止。
    
    Args:
        land: 陆地网格 / Land grid
        env_weights: 环境类型权重 / Environment type weights
        rng: 随机数生成器 / Random number generator
        base_switch: 基础切换概率 / Base switch probability
        switch_growth: 每个单元格增长的切换概率 / Switch probability growth per cell
        adjacency_bias: 邻近偏差 / Adjacency bias
        cohesion_bias: 内聚性偏差 / Cohesion bias
    
    Returns:
        环境映射 {(x, y): env_name, ...} / Environment map
    """
    height = len(land)
    width = len(land[0])

    # 收集所有陆地单元格 / Collect all land cells
    unassigned = set()
    for y in range(height):
        for x in range(width):
            if land[y][x]:
                unassigned.add((x, y))

    env_map = {}

    # 持续扩展区域直到所有陆地都被分配 / Keep expanding regions until all land is assigned
    while unassigned:
        # 随机选择种子位置 / Randomly select seed position
        start = rng.choice(tuple(unassigned))
        env_name = choose_environment_for_seed(
            start,
            env_weights,
            env_map,
            land,
            width,
            height,
            rng,
            adjacency_bias=adjacency_bias,
        )

        # 从种子开始扩展区域 / Expand region from seed
        grow_environment_region(
            start=start,
            env_name=env_name,
            land=land,
            unassigned=unassigned,
            env_map=env_map,
            width=width,
            height=height,
            rng=rng,
            base_switch=base_switch,
            switch_growth=switch_growth,
            cohesion_bias=cohesion_bias,
        )

    return env_map

# -----------------------------
# Pygame rendering
# Pygame渲染
# -----------------------------

def build_color_palette(env_names):
    """
    Build a color palette mapping environment names to RGB colors.
    构建环境名称到RGB颜色的映射调色板。
    
    Args:
        env_names: 环境名称列表 / List of environment names
    
    Returns:
        颜色映射字典 {env_name: (r, g, b), ...} / Color mapping dictionary
    """
    base_colors = [
        (34, 139, 34),    # forest green / 森林绿
        (222, 184, 135),  # plains/tan / 平原/棕褐色
        (70, 130, 180),   # water blue / 水蓝
        (139, 137, 137),  # mountain gray / 山脉灰
        (210, 180, 140),  # sand / 沙色
        (46, 139, 87),    # swamp green / 沼泽绿
        (154, 205, 50),   # light green / 浅绿
        (255, 140, 0),    # orange / 橙色
        (123, 104, 238),  # purple / 紫色
        (205, 92, 92),    # red-brown / 红棕色
        (0,0,0),          # black / 黑色
    ]
    colors = {}
    for i, env in enumerate(env_names):
        colors[env] = base_colors[i % len(base_colors)]
    return colors

def render_map(land, env_map, env_colors, env_name, tile_size=12):
    """
    Render the generated map using Pygame.
    使用Pygame渲染生成的地图。
    
    Displays land with different environment colors and optional grid lines.
    显示带有不同环境颜色的陆地以及可选的网格线。
    
    Args:
        land: 陆地网格 / Land grid
        env_map: 环境映射 / Environment map
        env_colors: 颜色映射 / Color mapping
        env_name: 环境名称 / Environment name
        tile_size: 瓦片大小（像素）/ Tile size in pixels
    """
    height = len(land)
    width = len(land[0])

    # 初始化Pygame窗口 / Initialize Pygame window
    pygame.init()
    window = pygame.display.set_mode((width * tile_size, height * tile_size))
    pygame.display.set_caption("Generated Island Map")
    clock = pygame.time.Clock()

    water_color = (0, 0, 0)  # Air/Vacuum / 空气/真空
    outline_color = (20, 20, 20)

    running = True
    while running:
        # 处理事件 / Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        # 清屏 / Clear screen
        window.fill((0, 0, 0))

        # 绘制每个瓦片 / Draw each tile
        for y in range(height):
            for x in range(width):
                rect = pygame.Rect(x * tile_size, y * tile_size, tile_size, tile_size)
                if not land[y][x]:
                    # 空气/真空颜色 / Air/Vacuum color
                    color = (0,0,0)
                elif not (
                    (y > 0 and land[y-1][x]) or
                    (x < width - 1 and land[y][x+1]) or
                    (x > 0 and land[y][x-1]) or
                    (y < height - 1 and land[y+1][x])
                ):
                    # 边缘检测（判断是否为孤立的土地像素，设为山脉灰色）/ Edge detection
                    env = "Mountain gray"
                    color = (139, 137, 137)
                else:
                    # 普通土地，根据环境类型着色 / Normal land, color by environment type
                    env = env_map.get((x, y))
                    color = env_colors.get(env, (200, 200, 200))
                pygame.draw.rect(window, color, rect)

                # 可选的网格线 / Optional grid lines
                pygame.draw.rect(window, outline_color, rect, 1)

        # 更新显示 / Update display
        pygame.display.flip()
        clock.tick(30)

    # 退出Pygame / Quit Pygame
    pygame.quit()

# -----------------------------
# Main
# 主程序
# -----------------------------

def main():
    """
    Main entry point - interactive island and environment generator.
    主入口 - 交互式岛屿和环境生成器。
    
    Prompts user for parameters and generates a procedural island map.
    提示用户输入参数并生成程序化岛屿地图。
    """
    print("=== Island / Environment Generator ===")
    print("Example env input: forest:5, plains:3, water:2, mountain:1\n")
    
    # 获取随机种子 / Get random seed
    rand = int(random.random()*100000)
    seed_raw = input("Random seed [" + str(rand) + "]: ").strip()
    seed = int(seed_raw) if seed_raw else rand
    rng = random.Random(seed)

    # 获取地图尺寸 / Get map dimensions
    width = ask_int("Map width", 100)
    height = ask_int("Map height", 80)

    # 获取岛屿数量 / Get number of islands
    num_islands = ask_int("Number of islands", 1)

    # 生成适合岛屿数量的默认半径列表 / Generate default radii list for the number of islands
    default_radii = ",".join([str(35 - i * 4) for i in range(num_islands)])

    # 获取岛屿半径 / Get island radii
    radii_text = input(
        f"Island radii (comma-separated, auto-repeats for more islands) [{default_radii}]: "
    ).strip() or default_radii
    radii = parse_radii(radii_text, num_islands)

    # 获取环境类型和权重 / Get environment types and weights
    env_text = input(
        "Environment types and weights [forest:5, plains:3, water:2, mountain:1]: "
    ).strip() or "forest:5, plains:3, water:2, mountain:1"
    env_weights = normalize_weights(parse_envs(env_text))

    # 获取环境生成参数 / Get environment generation parameters
    base_switch = ask_float("Base switch probability", 0.3)
    switch_growth = ask_float("Switch growth per cell", 0.025)
    adjacency_bias = ask_float("Adjacency bias", 0.35)
    cohesion_bias = ask_float("Cohesion bias", 0.10)
    tile_size = ask_int("Tile size in pixels", 10)

    # 生成岛屿和环境的2D地图 / Generate 2D maps for islands and environments
    land = generate_islands(width, height, radii, rng)
    env_map = generate_environment_map(
        land,
        env_weights,
        rng,
        base_switch=base_switch,
        switch_growth=switch_growth,
        adjacency_bias=adjacency_bias,
        cohesion_bias=cohesion_bias,
    )

    # 构建颜色调色板 / Build color palette
    env_names = [name for name, _ in env_weights]
    env_colors = build_color_palette(env_names)

    # 打印图例 / Print legend
    print("\nLegend:")
    print("Air/Vacuum = black")
    for name, color in env_colors.items():
        print(f"{name} = {color}")

    # 渲染地图 / Render map
    render_map(land, env_map, env_colors, name, tile_size=tile_size)

if __name__ == "__main__":
    main()
