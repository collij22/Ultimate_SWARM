/**
 * Quick PNG Decoder Test
 * Fast validation test to catch PNG encoding regressions early
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { createSimplePNG } from '../../orchestration/lib/deterministic/chart_render_executor.mjs';

describe('Quick PNG Decoder Tests', () => {
  
  it('should create valid PNG header', () => {
    // Create minimal test data
    const testData = {
      categories: ['A', 'B'],
      values: [10, 20],
      maxValue: 20
    };
    
    const pngBuffer = createSimplePNG(testData);
    
    // Check PNG signature (first 8 bytes)
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual(
      pngBuffer.slice(0, 8),
      signature,
      'PNG should have valid signature'
    );
  });
  
  it('should create decodeable PNG with correct dimensions', async () => {
    // Create test chart data
    const testData = {
      categories: ['Test1', 'Test2', 'Test3'],
      values: [100, 200, 150],
      maxValue: 200
    };
    
    const pngBuffer = createSimplePNG(testData);
    
    // Decode and validate
    await new Promise((resolve, reject) => {
      const png = new PNG();
      
      png.on('parsed', function() {
        try {
          assert.equal(this.width, 1280, 'Width should be 1280');
          assert.equal(this.height, 720, 'Height should be 720');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      png.on('error', reject);
      png.parse(pngBuffer);
    });
  });
  
  it('should produce PNG with chart content', async () => {
    // Create chart with distinct values
    const testData = {
      categories: ['Low', 'High', 'Medium'],
      values: [50, 200, 100],
      maxValue: 200
    };
    
    const pngBuffer = createSimplePNG(testData);
    
    // Quick content check
    await new Promise((resolve, reject) => {
      const png = new PNG();
      
      png.on('parsed', function() {
        try {
          // Sample a few pixels to verify content exists
          let hasNonWhite = false;
          let hasMultipleColors = false;
          const colors = new Set();
          
          // Sample 100 random pixels
          for (let i = 0; i < 100; i++) {
            const idx = Math.floor(Math.random() * this.data.length / 4) * 4;
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];
            
            colors.add(`${r},${g},${b}`);
            
            if (r !== 255 || g !== 255 || b !== 255) {
              hasNonWhite = true;
            }
          }
          
          if (colors.size >= 2) {
            hasMultipleColors = true;
          }
          
          assert.ok(hasNonWhite, 'PNG should have non-white pixels');
          assert.ok(hasMultipleColors, 'PNG should have multiple colors');
          
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      png.on('error', reject);
      png.parse(pngBuffer);
    });
  });
  
  it('should handle edge cases gracefully', () => {
    // Empty data
    const emptyData = {
      categories: [],
      values: [],
      maxValue: 0
    };
    
    const emptyPng = createSimplePNG(emptyData);
    assert.ok(emptyPng instanceof Buffer, 'Should return Buffer for empty data');
    assert.ok(emptyPng.length > 0, 'Should have content even for empty data');
    
    // Single value
    const singleData = {
      categories: ['Only'],
      values: [100],
      maxValue: 100
    };
    
    const singlePng = createSimplePNG(singleData);
    assert.ok(singlePng instanceof Buffer, 'Should handle single value');
    
    // Large values
    const largeData = {
      categories: ['Huge'],
      values: [999999],
      maxValue: 999999
    };
    
    const largePng = createSimplePNG(largeData);
    assert.ok(largePng instanceof Buffer, 'Should handle large values');
  });
  
  it('should compress data efficiently', () => {
    // Create a simple pattern that should compress well
    const simpleData = {
      categories: ['A', 'B', 'C', 'D'],
      values: [100, 100, 100, 100],  // Same values
      maxValue: 100
    };
    
    const pngBuffer = createSimplePNG(simpleData);
    
    // Uncompressed size would be width * height * 4 bytes
    const uncompressedSize = 1280 * 720 * 4;
    const compressionRatio = pngBuffer.length / uncompressedSize;
    
    console.log(`Compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);
    
    // PNG should compress to less than 10% for simple patterns
    assert.ok(compressionRatio < 0.1, 
      `Should compress efficiently (got ${(compressionRatio * 100).toFixed(2)}%)`);
  });
  
  it('should be fast to generate', () => {
    const testData = {
      categories: ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5'],
      values: [100, 200, 150, 300, 250],
      maxValue: 300
    };
    
    const startTime = performance.now();
    
    // Generate 10 PNGs
    for (let i = 0; i < 10; i++) {
      createSimplePNG(testData);
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / 10;
    
    console.log(`Average PNG generation time: ${avgTime.toFixed(2)}ms`);
    
    // Should generate PNG in less than 50ms on average
    assert.ok(avgTime < 50, 
      `Should generate PNG quickly (took ${avgTime.toFixed(2)}ms average)`);
  });
});