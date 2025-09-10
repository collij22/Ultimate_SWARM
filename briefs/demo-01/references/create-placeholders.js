// Create placeholder images for Phase 14 demo references
const fs = require('fs');
const path = require('path');

// Minimal 1x1 transparent PNG (89 bytes)
const minimalPNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001' +
    '0100000000376ef9240000001049444154789c626001000000' +
    '05000106e3ac8c0000000049454e44ae426082',
  'hex',
);

// Create placeholder images
const placeholders = ['hero-mockup.png', 'product-grid.png', 'cart-view.png', 'checkout.png'];

placeholders.forEach((filename) => {
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, minimalPNG);
  console.log(`Created placeholder: ${filename}`);
});

console.log('All placeholder images created successfully');
