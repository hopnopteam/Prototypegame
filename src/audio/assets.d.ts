/** Sound files are inlined by the build as base64 strings (esbuild `base64` loader). */
declare module '*.mp3' {
  const data: string;
  export default data;
}
