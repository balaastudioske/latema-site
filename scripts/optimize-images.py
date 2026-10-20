from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "images"
DESTINATION = ROOT / "public" / "media"
DESTINATION.mkdir(parents=True, exist_ok=True)

for path in sorted(SOURCE.glob("*.jpg")):
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((1400, 1000), Image.Resampling.LANCZOS)
        target = DESTINATION / f"{path.stem}.webp"
        image.save(target, "WEBP", quality=76, method=6)
        print(f"{path.name} -> {target.name} ({target.stat().st_size // 1024} KB)")
