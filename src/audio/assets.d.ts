/** Sound files are inlined by the build as base64 strings (esbuild `base64` loader). */
declare module '*.mp3' {
  const data: string;
  export default data;
}

/** Session 49: images (detail textures, baked models) are inlined the same way. */
declare module '*.jpg' {
  const data: string;
  export default data;
}
declare module '*.bin' {
  const data: string;
  export default data;
}
