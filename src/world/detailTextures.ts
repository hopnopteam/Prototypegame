import * as THREE from 'three';
import sheet from '../../assets/textures/detail.jpg';
import { DETAIL_LAYERS } from './detail';
import { LIGHT_UNIFORMS } from './materials';

/**
 * Session 49: decodes the detail sheet (layers stacked top to bottom, see scripts/assets/build_textures.py) into one
 * mipmapped texture array and hands it to every lit material. Called once at start-up, before the shaders warm up;
 * if the image cannot be decoded the flat placeholder stays and the game simply looks as it did.
 */
export async function loadDetailTextures(): Promise<void> {
  try {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${sheet}`;
    await img.decode();
    const size = img.width;
    const layers = DETAIL_LAYERS.length;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size * layers;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || img.height < size * layers) return;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, size, size * layers).data;
    // Canvas rows run top to bottom, one layer after another: exactly a texture array's layout.
    const tex = new THREE.DataArrayTexture(new Uint8Array(pixels.buffer.slice(0)), size, size, layers);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    // Stored as plain ratios around 0.5, not colours: no sRGB decode.
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    LIGHT_UNIFORMS.uNxDetail.value = tex;
  } catch {
    // The flat layer stays: nothing changes but the grain.
  }
}
