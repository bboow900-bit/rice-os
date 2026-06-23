from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path("assets/icons")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def font(size):
    candidates = [
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def make_icon(size):
    img = Image.new("RGB", (size, size), "#29a861")
    draw = ImageDraw.Draw(img)

    pad = int(size * 0.09)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=int(size * 0.18),
        fill="#35b96d",
    )

    for i, color in enumerate(["#fff1a6", "#d8f8de", "#dff1ff"]):
        y = int(size * (0.58 + i * 0.08))
        draw.arc(
            [int(size * 0.12), y - int(size * 0.25), int(size * 0.88), y + int(size * 0.25)],
            start=200,
            end=340,
            fill=color,
            width=max(3, int(size * 0.025)),
        )

    rice_font = font(int(size * 0.36))
    os_font = font(int(size * 0.15))
    text = "稲"
    bbox = draw.textbbox((0, 0), text, font=rice_font)
    x = (size - (bbox[2] - bbox[0])) / 2
    y = int(size * 0.18)
    draw.text((x, y), text, font=rice_font, fill="white")

    label = "OS"
    bbox = draw.textbbox((0, 0), label, font=os_font)
    x = (size - (bbox[2] - bbox[0])) / 2
    y = int(size * 0.57)
    draw.rounded_rectangle(
        [int(size * 0.36), int(size * 0.60), int(size * 0.64), int(size * 0.74)],
        radius=int(size * 0.04),
        fill="#1f6f46",
    )
    draw.text((x, y), label, font=os_font, fill="white")

    img.save(OUT_DIR / f"icon-{size}.png")


for icon_size in (192, 512):
    make_icon(icon_size)
    print(OUT_DIR / f"icon-{icon_size}.png")
