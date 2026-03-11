#!/usr/bin/env node
/**
 * Deterministic Aria Logo Generator
 * Generates the Aria logo as SVG or PNG with consistent output.
 * 
 * Usage:
 *   node scripts/generate-logo.mjs [--size 512] [--format svg|png] [--output path]
 */

import { writeFileSync } from 'fs';

// ============================================================================
// Configuration (tweak these for variations)
// ============================================================================
const CONFIG = {
  // Colors
  bgGradientStart: '#1a1a3e',
  bgGradientEnd: '#2d1b4e',
  accentCyan: '#4fd1c5',
  accentCyanLight: '#81e6d9',
  accentGold: '#d4a853',
  accentGoldLight: '#e6c87a',
  nodeGlow: '#4fd1c5',
  bracketColor: '#63b3ed',
  arrowColor: '#a0aec0',
  textColor: '#e2e8f0',
  
  // Neural network
  nodeCount: 8,
  nodeRadius: 6,
  connectionOpacity: 0.6,
  
  // Seed for deterministic randomness
  seed: 42,
};

// ============================================================================
// Seeded random number generator (deterministic)
// ============================================================================
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ============================================================================
// SVG Generator
// ============================================================================
function generateSVG(size = 512) {
  const rand = seededRandom(CONFIG.seed);
  const scale = size / 512;
  const s = (v) => v * scale;
  
  // Generate deterministic node positions for neural network
  const nodes = [];
  for (let i = 0; i < CONFIG.nodeCount; i++) {
    nodes.push({
      x: 80 + rand() * 100,
      y: 120 + rand() * 200,
    });
  }
  
  // Generate connections between nearby nodes
  const connections = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dist < 120 && rand() > 0.3) {
        connections.push([i, j]);
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${CONFIG.bgGradientStart}"/>
      <stop offset="100%" style="stop-color:${CONFIG.bgGradientEnd}"/>
    </linearGradient>
    
    <!-- Cyan glow gradient for A -->
    <linearGradient id="aGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${CONFIG.accentCyan}"/>
      <stop offset="100%" style="stop-color:${CONFIG.accentCyanLight}"/>
    </linearGradient>
    
    <!-- Gold accent gradient -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${CONFIG.accentGold}"/>
      <stop offset="100%" style="stop-color:${CONFIG.accentGoldLight}"/>
    </linearGradient>
    
    <!-- Glow filter -->
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Strong glow for nodes -->
    <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Rounded square background -->
  <rect x="16" y="16" width="480" height="480" rx="80" ry="80" fill="url(#bgGrad)"/>
  
  <!-- Shield outline (subtle) -->
  <path d="M256 60 L420 120 L420 280 Q420 400 256 460 Q92 400 92 280 L92 120 Z" 
        fill="none" stroke="url(#goldGrad)" stroke-width="3" opacity="0.4"/>
  
  <!-- Neural network connections -->
  <g opacity="${CONFIG.connectionOpacity}">
    ${connections.map(([i, j]) => 
      `<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}" 
             stroke="${CONFIG.nodeGlow}" stroke-width="2"/>`
    ).join('\n    ')}
  </g>
  
  <!-- Neural network nodes -->
  <g filter="url(#nodeGlow)">
    ${nodes.map(n => 
      `<circle cx="${n.x}" cy="${n.y}" r="${CONFIG.nodeRadius}" fill="${CONFIG.nodeGlow}"/>`
    ).join('\n    ')}
  </g>
  
  <!-- Main "A" letter -->
  <g filter="url(#glow)">
    <path d="M256 100 L180 360 L210 360 L225 310 L287 310 L302 360 L332 360 L256 100 Z
             M235 280 L256 200 L277 280 Z" 
          fill="url(#aGrad)" stroke="${CONFIG.accentCyanLight}" stroke-width="2"/>
  </g>
  
  <!-- Gold accent on right side of A -->
  <path d="M290 140 L332 360 L340 360 L298 140 Z" 
        fill="url(#goldGrad)" opacity="0.7"/>
  
  <!-- Code brackets {} -->
  <g fill="none" stroke="${CONFIG.bracketColor}" stroke-width="6" stroke-linecap="round" opacity="0.9">
    <!-- Left bracket { -->
    <path d="M355 160 Q340 160 340 180 L340 240 Q340 256 325 256 Q340 256 340 272 L340 332 Q340 352 355 352"/>
    <!-- Right bracket } -->
    <path d="M385 160 Q400 160 400 180 L400 240 Q400 256 415 256 Q400 256 400 272 L400 332 Q400 352 385 352"/>
  </g>
  
  <!-- Loop arrow beneath -->
  <g fill="none" stroke="${CONFIG.arrowColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M180 380 Q180 420 256 420 Q332 420 332 380"/>
    <!-- Arrow head -->
    <path d="M320 368 L332 380 L320 392"/>
  </g>
  
  <!-- "IDE" label -->
  <text x="256" y="465" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
        font-size="28" font-weight="600" fill="${CONFIG.textColor}" letter-spacing="4">IDE</text>
</svg>`;

  return svg;
}

// ============================================================================
// PNG Generator (requires canvas package)
// ============================================================================
async function generatePNG(size = 512) {
  let canvas, ctx;
  
  try {
    const { createCanvas: cc } = await import('canvas');
    canvas = cc(size, size);
    ctx = canvas.getContext('2d');
  } catch (e) {
    console.error('PNG generation requires the "canvas" package.');
    console.error('Install with: npm install canvas');
    process.exit(1);
  }
  
  const rand = seededRandom(CONFIG.seed);
  const scale = size / 512;
  const s = (v) => v * scale;
  
  // Background with rounded corners
  ctx.fillStyle = CONFIG.bgGradientStart;
  roundRect(ctx, s(16), s(16), s(480), s(480), s(80));
  ctx.fill();
  
  // Create gradient overlay
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, CONFIG.bgGradientStart);
  bgGrad.addColorStop(1, CONFIG.bgGradientEnd);
  ctx.fillStyle = bgGrad;
  roundRect(ctx, s(16), s(16), s(480), s(480), s(80));
  ctx.fill();
  
  // Generate nodes
  const nodes = [];
  for (let i = 0; i < CONFIG.nodeCount; i++) {
    nodes.push({
      x: s(80 + rand() * 100),
      y: s(120 + rand() * 200),
    });
  }
  
  // Draw connections
  ctx.strokeStyle = CONFIG.nodeGlow;
  ctx.lineWidth = s(2);
  ctx.globalAlpha = CONFIG.connectionOpacity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dist < s(120) && rand() > 0.3) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  
  // Draw nodes with glow
  ctx.fillStyle = CONFIG.nodeGlow;
  ctx.shadowColor = CONFIG.nodeGlow;
  ctx.shadowBlur = s(12);
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, s(CONFIG.nodeRadius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  
  // Draw "A"
  const aGrad = ctx.createLinearGradient(s(180), s(100), s(332), s(360));
  aGrad.addColorStop(0, CONFIG.accentCyan);
  aGrad.addColorStop(1, CONFIG.accentCyanLight);
  ctx.fillStyle = aGrad;
  ctx.shadowColor = CONFIG.accentCyan;
  ctx.shadowBlur = s(8);
  
  ctx.beginPath();
  ctx.moveTo(s(256), s(100));
  ctx.lineTo(s(180), s(360));
  ctx.lineTo(s(210), s(360));
  ctx.lineTo(s(225), s(310));
  ctx.lineTo(s(287), s(310));
  ctx.lineTo(s(302), s(360));
  ctx.lineTo(s(332), s(360));
  ctx.closePath();
  ctx.fill();
  
  // A crossbar cutout
  ctx.fillStyle = CONFIG.bgGradientEnd;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(s(235), s(280));
  ctx.lineTo(s(256), s(200));
  ctx.lineTo(s(277), s(280));
  ctx.closePath();
  ctx.fill();
  
  // Gold accent
  ctx.fillStyle = CONFIG.accentGold;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(s(290), s(140));
  ctx.lineTo(s(332), s(360));
  ctx.lineTo(s(340), s(360));
  ctx.lineTo(s(298), s(140));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  
  // Code brackets
  ctx.strokeStyle = CONFIG.bracketColor;
  ctx.lineWidth = s(6);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  
  // Left {
  ctx.beginPath();
  ctx.moveTo(s(355), s(160));
  ctx.quadraticCurveTo(s(340), s(160), s(340), s(180));
  ctx.lineTo(s(340), s(240));
  ctx.quadraticCurveTo(s(340), s(256), s(325), s(256));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s(325), s(256));
  ctx.quadraticCurveTo(s(340), s(256), s(340), s(272));
  ctx.lineTo(s(340), s(332));
  ctx.quadraticCurveTo(s(340), s(352), s(355), s(352));
  ctx.stroke();
  
  // Right }
  ctx.beginPath();
  ctx.moveTo(s(385), s(160));
  ctx.quadraticCurveTo(s(400), s(160), s(400), s(180));
  ctx.lineTo(s(400), s(240));
  ctx.quadraticCurveTo(s(400), s(256), s(415), s(256));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s(415), s(256));
  ctx.quadraticCurveTo(s(400), s(256), s(400), s(272));
  ctx.lineTo(s(400), s(332));
  ctx.quadraticCurveTo(s(400), s(352), s(385), s(352));
  ctx.stroke();
  ctx.globalAlpha = 1;
  
  // Loop arrow
  ctx.strokeStyle = CONFIG.arrowColor;
  ctx.lineWidth = s(5);
  ctx.beginPath();
  ctx.moveTo(s(180), s(380));
  ctx.quadraticCurveTo(s(180), s(420), s(256), s(420));
  ctx.quadraticCurveTo(s(332), s(420), s(332), s(380));
  ctx.stroke();
  
  // Arrow head
  ctx.beginPath();
  ctx.moveTo(s(320), s(368));
  ctx.lineTo(s(332), s(380));
  ctx.lineTo(s(320), s(392));
  ctx.stroke();
  
  // "IDE" text
  ctx.fillStyle = CONFIG.textColor;
  ctx.font = `600 ${s(28)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = `${s(4)}px`;
  ctx.fillText('IDE', s(256), s(465));
  
  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================================================
// CLI
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  let size = 512;
  let format = 'svg';
  let output = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1]) {
      size = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[i + 1];
      i++;
    }
  }
  
  if (format === 'svg') {
    const svg = generateSVG(size);
    if (output) {
      writeFileSync(output, svg);
      console.log(`SVG written to ${output}`);
    } else {
      console.log(svg);
    }
  } else if (format === 'png') {
    const png = await generatePNG(size);
    if (output) {
      writeFileSync(output, png);
      console.log(`PNG written to ${output}`);
    } else {
      process.stdout.write(png);
    }
  } else {
    console.error(`Unknown format: ${format}. Use 'svg' or 'png'.`);
    process.exit(1);
  }
}

main().catch(console.error);

export { generateSVG, generatePNG, CONFIG };
