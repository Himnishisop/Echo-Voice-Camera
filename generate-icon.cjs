const fs = require('fs');
const zlib = require('zlib');

// Create a 512x512 PNG representing the Echo Voice Camera app icon:
// Dark emerald gradient background (#0d2b1e to #06150e) with glowing green audio soundwave
const width = 512;
const height = 512;

// Raw RGBA buffer with filter byte per row
const rowBytes = 1 + width * 4;
const buffer = Buffer.alloc(rowBytes * height);

for (let y = 0; y < height; y++) {
  const rowOffset = y * rowBytes;
  buffer[rowOffset] = 0; // Filter type None
  
  for (let x = 0; x < width; x++) {
    const pxOffset = rowOffset + 1 + x * 4;
    
    // Normalized coords
    const nx = (x - width / 2) / (width / 2);
    const ny = (y - height / 2) / (height / 2);
    
    // Rounded corner mask for 512x512 icon (radius ~110px)
    const rad = 0.22;
    const dx = Math.max(0, Math.abs(nx) - (1 - rad));
    const dy = Math.max(0, Math.abs(ny) - (1 - rad));
    const outsideDist = Math.sqrt(dx * dx + dy * dy);
    if (outsideDist > rad) {
      // transparent outside
      buffer[pxOffset] = 0;
      buffer[pxOffset + 1] = 0;
      buffer[pxOffset + 2] = 0;
      buffer[pxOffset + 3] = 0;
      continue;
    }
    
    // Radial gradient dark green
    const distFromCenter = Math.sqrt(nx * nx + ny * ny);
    let r = Math.max(6, Math.min(22, Math.round(18 - distFromCenter * 14)));
    let g = Math.max(16, Math.min(65, Math.round(55 - distFromCenter * 40)));
    let b = Math.max(12, Math.min(42, Math.round(34 - distFromCenter * 24)));
    
    // Audio waveform shape calculation
    // Symmetric around x=0:
    const ax = Math.abs(nx);
    let waveAmp = 0;
    if (ax < 0.85) {
      // Multiple peaks matching the soundwave in icon-512.png
      const p1 = Math.exp(-Math.pow(ax / 0.12, 2)) * 0.65; // center tallest peak
      const p2 = Math.exp(-Math.pow((ax - 0.32) / 0.11, 2)) * 0.40; // secondary peak
      const p3 = Math.exp(-Math.pow((ax - 0.60) / 0.12, 2)) * 0.18; // outer peak
      const base = 0.05 * Math.cos(ax * Math.PI * 0.5);
      waveAmp = Math.max(p1, Math.max(p2, p3)) + base;
    }
    
    const distToWave = Math.abs(ny) - waveAmp;
    
    if (distToWave < 0) {
      // Inside the silver/chrome soundwave body
      const depth = -distToWave;
      const highlight = Math.min(1, depth / 0.04);
      // Silver metallic gradient
      const silver = Math.round(185 + 65 * Math.sin((nx * 4 + ny * 6) * Math.PI) * 0.2 + depth * 120);
      r = Math.min(245, Math.max(170, silver));
      g = Math.min(250, Math.max(185, silver + 5));
      b = Math.min(255, Math.max(195, silver + 12));
    } else if (distToWave < 0.16) {
      // Neon green glow surrounding the wave
      const glow = Math.pow(1 - distToWave / 0.16, 2.2);
      r = Math.round(r * (1 - glow) + 45 * glow);
      g = Math.round(g * (1 - glow) + 245 * glow);
      b = Math.round(b * (1 - glow) + 120 * glow);
    }
    
    buffer[pxOffset] = r;
    buffer[pxOffset + 1] = g;
    buffer[pxOffset + 2] = b;
    buffer[pxOffset + 3] = 255;
  }
}

// Compress data with zlib
const idatData = zlib.deflateSync(buffer);

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc ^ byte) & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// PNG Header
const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // Bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0; // Compression
ihdr[11] = 0; // Filter
ihdr[12] = 0; // Interlace

const ihdrChunk = makeChunk('IHDR', ihdr);
const idatChunk = makeChunk('IDAT', idatData);
const iendChunk = makeChunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
fs.writeFileSync('public/icon-512.png', png);
console.log('icon-512.png created successfully: ' + png.length + ' bytes');
