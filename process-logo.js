import { Jimp } from 'jimp';

async function processImage(inputPath, outputPath, crop = false) {
  const image = await Jimp.read(inputPath);
  
  // Make white background transparent
  const targetColor = { r: 255, g: 255, b: 255, a: 255 }; // White
  const colorDistance = (c1, c2) => {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  };
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    // If pixel is close to white (tolerance ~20)
    if (colorDistance({ r, g, b }, targetColor) < 30) {
      this.bitmap.data[idx + 3] = 0; // Alpha to 0
    }
  });

  if (crop) {
    // Autocrop transparent pixels
    image.autocrop();
  }

  // Ensure it's a square for PWA icons
  const maxDim = Math.max(image.bitmap.width, image.bitmap.height);
  const squared = new Jimp({ width: maxDim, height: maxDim, color: 0x00000000 }); // transparent background
  const x = (maxDim - image.bitmap.width) / 2;
  const y = (maxDim - image.bitmap.height) / 2;
  
  squared.composite(image, x, y);
  
  const writeJimp = (img, path) => new Promise((resolve, reject) => img.write(path, err => err ? reject(err) : resolve()));
  
  await writeJimp(squared, outputPath);
  console.log('Processed:', outputPath);
}

async function main() {
  await processImage('public/logo.jpg', 'public/logo.png', true);
  
  // Create resized versions
  const finalImage = await Jimp.read('public/logo.png');
  const writeJimp = (img, path) => new Promise((resolve, reject) => img.write(path, err => err ? reject(err) : resolve()));
  
  const icon192 = finalImage.clone().resize({ w: 192, h: 192 });
  await writeJimp(icon192, 'public/logo-192.png');
  
  const icon512 = finalImage.clone().resize({ w: 512, h: 512 });
  await writeJimp(icon512, 'public/logo-512.png');
  
  const favicon = finalImage.clone().resize({ w: 32, h: 32 });
  await writeJimp(favicon, 'public/favicon.ico');
}

main().catch(console.error);
