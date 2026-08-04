import sys
from PIL import Image, ImageChops
import numpy as np

def trim_and_transparent(img_path, out_path, size=None, padding_ratio=0.1):
    img = Image.open(img_path).convert("RGBA")
    data = np.array(img)
    
    # Calculate distance to white (255, 255, 255)
    rgb = data[:, :, :3]
    white = np.array([255, 255, 255])
    dist = np.linalg.norm(rgb - white, axis=-1)
    
    # Tolerance of 30
    mask = dist > 30
    
    # Apply alpha
    data[:, :, 3] = mask * 255
    new_img = Image.fromarray(data)
    
    # Crop to bounding box
    bbox = new_img.getbbox()
    if bbox:
        new_img = new_img.crop(bbox)
        
    if size:
        # We want to fit it into a square `size`x`size` with `padding_ratio`
        w, h = new_img.size
        # The usable area
        usable_size = int(size * (1 - padding_ratio * 2))
        
        # Scale to fit usable_size
        scale = min(usable_size / w, usable_size / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        new_img = new_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Paste into center of a transparent square
        square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        offset = ((size - new_w) // 2, (size - new_h) // 2)
        square.paste(new_img, offset, new_img)
        square.save(out_path)
    else:
        new_img.save(out_path)
        
try:
    print("Processing logo.png...")
    trim_and_transparent('public/logo.jpg', 'public/logo.png')
    print("Processing logo-192.png...")
    trim_and_transparent('public/logo.jpg', 'public/logo-192.png', size=192, padding_ratio=0.05)
    print("Processing logo-512.png...")
    trim_and_transparent('public/logo.jpg', 'public/logo-512.png', size=512, padding_ratio=0.05)
    print("Processing favicon.ico...")
    trim_and_transparent('public/logo.jpg', 'public/favicon.ico', size=32, padding_ratio=0.0)
    print("Done!")
except Exception as e:
    print("Error:", e)
    sys.exit(1)
