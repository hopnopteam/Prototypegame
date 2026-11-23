import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  for (const e of doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'KHR_mesh_quantization'].includes(e.extensionName)) e.dispose();
  }
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png' }));
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'EXT_texture_webp') e.dispose();
  await io.write(f.replace('.glb', '_p.glb'), doc);
  console.log('ok', f);
}
