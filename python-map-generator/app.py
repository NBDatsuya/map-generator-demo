# ---------------------------
# Flask Web Application
# Flask Web 应用
# ---------------------------
#
# A Flask web application for the island map generator.
# Provides a web interface with parameters form on the left
# and map preview on the right.
#
# 岛屿地图生成器的 Flask Web 应用
# 提供网页界面，左侧为参数表单，右侧为地图预览

from flask import Flask, request, jsonify, send_file, render_template
from io import BytesIO
import base64

from generator import generate_map

app = Flask(__name__)


def render_map_to_base64(land, env_map, env_colors, width, height):
    """
    Render the map to a base64-encoded PNG image.
    将地图渲染为 base64 编码的 PNG 图片。

    Args:
        land: 陆地网格 / Land grid
        env_map: 环境映射 / Environment map
        env_colors: 颜色映射 / Color mapping
        width: 地图宽度 / Map width
        height: 地图高度 / Map height

    Returns:
        str: Base64 编码的图片数据 / Base64 encoded image data
    """
    # Create a simple PPM format image and convert to PNG
    # 创建简单的 PPM 格式图片并转换为 PNG
    import struct

    # Calculate tile size based on canvas size
    # 根据画布大小计算瓦片大小
    max_width = 800
    max_height = 600
    tile_size_w = max(1, max_width // width)
    tile_size_h = max(1, max_height // height)
    tile_size = min(tile_size_w, tile_size_h, 12)  # Cap at 12 pixels / 最大12像素

    canvas_width = width * tile_size
    canvas_height = height * tile_size

    # Create PNG manually
    # 手动创建 PNG
    def create_png(w, h, pixels):
        """Create a PNG image from pixel data."""
        def crc32(data):
            import zlib
            return zlib.crc32(data) & 0xffffffff

        def chunk(chunk_type, data):
            length = len(data)
            result = struct.pack('>I', length) + chunk_type + data
            crc = crc32(chunk_type + data)
            result += struct.pack('>I', crc)
            return result

        # PNG signature
        signature = b'\x89PNG\r\n\x1a\n'

        # IHDR chunk
        ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
        ihdr = chunk(b'IHDR', ihdr_data)

        # IDAT chunk (image data)
        import zlib
        raw_data = b''
        for y in range(h):
            raw_data += b'\x00'  # Filter type: None
            for x in range(w):
                raw_data += bytes(pixels[y * w + x])

        compressed = zlib.compress(raw_data, 9)
        idat = chunk(b'IDAT', compressed)

        # IEND chunk
        iend = chunk(b'IEND', b'')

        return signature + ihdr + idat + iend

    # Build pixel data
    # 构建像素数据
    pixels = []
    for y in range(height):
        for x in range(width):
            if not land[y][x]:
                # Water / 水域
                pixels.append((0, 0, 0))
            else:
                # Check edge detection / 检查边缘检测
                is_edge = not (
                    (y > 0 and land[y-1][x]) or
                    (x < width - 1 and land[y][x+1]) or
                    (x > 0 and land[y][x-1]) or
                    (y < height - 1 and land[y+1][x])
                )
                if is_edge:
                    # Edge (Mountain gray) / 边缘（山脉灰）
                    pixels.append((139, 137, 137))
                else:
                    # Normal land / 普通陆地
                    env = env_map.get((x, y))
                    color = env_colors.get(env, (200, 200, 200))
                    pixels.append(color)

    # Scale up pixels for tile rendering
    # 缩放像素以渲染瓦片
    if tile_size > 1:
        scaled_pixels = []
        for y in range(height):
            for ty in range(tile_size):
                for x in range(width):
                    for tx in range(tile_size):
                        scaled_pixels.append(pixels[y * width + x])
        canvas_width = width * tile_size
        canvas_height = height * tile_size
        pixels = scaled_pixels

    # Create PNG
    png_data = create_png(canvas_width, canvas_height, pixels)

    # Encode to base64
    # 编码为 base64
    return base64.b64encode(png_data).decode('utf-8')


@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')


@app.route('/api/generate', methods=['POST'])
def api_generate():
    """
    Generate a map with given parameters.
    使用给定参数生成地图。

    Request JSON:
        width: int - Map width
        height: int - Map height
        seed: int or null - Random seed
        num_islands: int - Number of islands
        radii: str - Island radii
        environments: str - Environment types and weights
        base_switch: float - Base switch probability
        switch_growth: float - Switch growth per cell
        adjacency_bias: float - Adjacency bias
        cohesion_bias: float - Cohesion bias

    Returns:
        JSON with map image (base64) and legend
    """
    data = request.get_json()

    try:
        # Parse parameters / 解析参数
        width = int(data.get('width', 100))
        height = int(data.get('height', 80))
        seed = data.get('seed')
        if seed is not None:
            seed = int(seed)
        num_islands = int(data.get('num_islands', 1))
        radii = str(data.get('radii', '35'))
        environments = str(data.get('environments', 'forest:5, plains:3, water:2, mountain:1'))
        base_switch = float(data.get('base_switch', 0.03))
        switch_growth = float(data.get('switch_growth', 0.0025))
        adjacency_bias = float(data.get('adjacency_bias', 0.35))
        cohesion_bias = float(data.get('cohesion_bias', 0.20))

        # Generate map / 生成地图
        land, env_map, env_colors, legend, used_seed = generate_map(
            width=width,
            height=height,
            seed=seed,
            num_islands=num_islands,
            radii=radii,
            environments=environments,
            base_switch=base_switch,
            switch_growth=switch_growth,
            adjacency_bias=adjacency_bias,
            cohesion_bias=cohesion_bias,
        )

        # Render to image / 渲染为图片
        image_data = render_map_to_base64(land, env_map, env_colors, width, height)

        # Convert legend to serializable format
        # 转换图例为可序列化格式
        legend_serializable = {
            k: list(v) for k, v in legend.items()
        }

        return jsonify({
            'success': True,
            'image': image_data,
            'legend': legend_serializable,
            'seed': used_seed,
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


if __name__ == '__main__':
    # Run the Flask application
    # 运行 Flask 应用
    app.run(debug=True, host='0.0.0.0', port=5001)
