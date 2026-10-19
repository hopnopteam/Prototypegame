// How chunk files are written (the editor and its dev-server save hook share it): readable, diff-friendly JSON
// with each point and each small object on one line.

export function formatChunkJson(chunk: unknown): string {
  return `${JSON.stringify(chunk, null, 2)
    .replace(/\[\s+(-?[\d.e+-]+),\s+(-?[\d.e+-]+)\s+\]/g, '[$1, $2]')
    .replace(/\{\s+([^{}[\]]*?)\s+\}/g, (_m, body: string) => `{ ${body.replace(/\s*\n\s*/g, ' ')} }`)}\n`;
}
