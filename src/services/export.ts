import JSZip from 'jszip';
import { getCanonicalPzLanguageSuffix, getPzLanguageSuffix } from '../constants/languages';

export interface ExportOptions {
  folderName: string;
  modId: string;
  modName: string;
  author: string;
  description: string;
  version: string;
  url: string;
  require: string;
}

// Exportar a formato local (automático según extensión)
export async function exportLocal(
  files: Array<{ name: string; content: string }>,
  targetLang: string
): Promise<Blob> {
  const zip = new JSZip();
  const targetSuffix = getPzLanguageSuffix(targetLang);
  const isModern = files.length > 0 && files[0].name.endsWith('.json');

  if (isModern) {
    // Estructura moderna: mismo destino de Translate, pero con archivos JSON.
    for (const file of files) {
      const match = file.name.match(/^(.+)_([A-Z]{2,4})\.json$/);
      if (match) {
        const baseName = match[1];
        const lang = getCanonicalPzLanguageSuffix(match[2]);
        zip.file(`media/lua/shared/Translate/${lang}/${baseName}.json`, file.content);
      } else {
        zip.file(`media/lua/shared/Translate/${targetSuffix}/${file.name}`, file.content);
      }
    }
  } else {
    // Estructura legacy: una sola carpeta Translate/XX/
    files.forEach(file => {
      zip.file(`media/lua/shared/Translate/${targetSuffix}/${file.name}`, file.content);
    });
  }

  return await zip.generateAsync({ type: 'blob' });
}

// Exportar para Workshop (estructura completa de mod)
export async function exportWorkshop(
  files: Array<{ name: string; content: string }>,
  targetLang: string,
  options: ExportOptions
): Promise<Blob> {
  const zip = new JSZip();
  const targetSuffix = getPzLanguageSuffix(targetLang);
  const base = `Contents/mods/${options.folderName}/`;
  const isModern = files.length > 0 && files[0].name.endsWith('.json');

  zip.file(`${base}42/.keep`, '');
  zip.file(`${base}common/.keep`, '');

  if (isModern) {
    for (const file of files) {
      const match = file.name.match(/^(.+)_([A-Z]{2,4})\.json$/);
      if (match) {
        const baseName = match[1];
        const lang = getCanonicalPzLanguageSuffix(match[2]);
        zip.file(`${base}media/lua/shared/Translate/${lang}/${baseName}.json`, file.content);
      } else {
        zip.file(`${base}media/lua/shared/Translate/${targetSuffix}/${file.name}`, file.content);
      }
    }
  } else {
    files.forEach(file => {
      zip.file(`${base}media/lua/shared/Translate/${targetSuffix}/${file.name}`, file.content);
    });
  }

  const modInfo = buildModInfo(options);
  zip.file(`${base}mod.info`, modInfo);
  zip.file(`${base}42/mod.info`, modInfo);

  zip.file(`${base}poster.png`, await makePlaceholderPng(512, 512, 'poster'));
  zip.file(`${base}icon.png`, await makePlaceholderPng(64, 64, 'icon'));
  zip.file(`${base}42/poster.png`, await makePlaceholderPng(512, 512, 'poster'));
  zip.file(`${base}42/icon.png`, await makePlaceholderPng(64, 64, 'icon'));

  return await zip.generateAsync({ type: 'blob' });
}

function buildModInfo(options: ExportOptions): string {
  const lines: string[] = [];
  if (options.modName) lines.push(`name=${options.modName}`);
  if (options.modId) lines.push(`id=${options.modId}`);
  if (options.description) lines.push(`description=${options.description.replace(/\n/g, '\\n')}`);
  lines.push('poster=poster.png');
  lines.push('icon=icon.png');
  if (options.author) lines.push(`author=${options.author}`);
  if (options.version) lines.push(`version=${options.version}`);
  if (options.url) lines.push(`url=${options.url}`);
  if (options.require) lines.push(`require=${options.require}`);
  return lines.join('\n') + '\n';
}

async function makePlaceholderPng(width: number, height: number, label: string): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d0d1f';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#00f0ff';
  ctx.font = `${Math.max(10, Math.floor(width / 8))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height / 2);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(resolve as BlobCallback, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
