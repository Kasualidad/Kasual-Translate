import type { WorkshopMod } from '../types';

export interface ScanProgress {
  current: number;
  total: number;
  currentMod: string;
}

export async function scanWorkshopFolder(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (progress: ScanProgress) => void
): Promise<WorkshopMod[]> {
  const mods: WorkshopMod[] = [];
  let totalDirs = 0;
  let processed = 0;

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') totalDirs++;
  }

  if (totalDirs === 0) return [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      processed++;
      if (onProgress) onProgress({ current: processed, total: totalDirs, currentMod: entry.name });

      const mod = await readModInfo(entry);
      if (mod) mods.push(mod);

      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return mods;
}

async function readModInfo(dirHandle: FileSystemDirectoryHandle): Promise<WorkshopMod | null> {
  const mod: WorkshopMod = {
    id: dirHandle.name,
    name: dirHandle.name,
    handle: dirHandle,
    imageUrl: '',
    description: '',
    author: ''
  };

  const candidateImages: Array<{ url: string; priority: 'high' | 'low'; isIcon: boolean; size?: { width: number; height: number } }> = [];

  try {
    await scanDirectoryForInfo(dirHandle, mod, candidateImages);
  } catch (e) {
    console.warn(`Error leyendo mod ${dirHandle.name}:`, e);
  }

  const priorityImage = candidateImages.find(img => img.priority === 'high');
  if (priorityImage) {
    mod.imageUrl = priorityImage.url;
  } else {
    const largeImage = candidateImages.find(img => img.size && img.size.width >= 250 && img.size.height >= 250 && !img.isIcon);
    if (largeImage) {
      mod.imageUrl = largeImage.url;
    } else {
      const iconImage = candidateImages.find(img => img.isIcon);
      if (iconImage) {
        mod.imageUrl = iconImage.url;
      } else {
        mod.imageUrl = createPlaceholderImage(mod.name);
      }
    }
  }

  return mod;
}

async function scanDirectoryForInfo(
  dirHandle: FileSystemDirectoryHandle,
  mod: WorkshopMod,
  candidateImages: Array<{ url: string; priority: 'high' | 'low'; isIcon: boolean; size?: { width: number; height: number } }>
) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      await scanDirectoryForInfo(entry, mod, candidateImages);
    } else if (entry.kind === 'file') {
      const fileName = entry.name.toLowerCase();

      if (fileName === 'mod.info' || fileName === 'workshop.txt') {
        const file = await entry.getFile();
        const content = await file.text();
        const lines = content.split('\n');
        for (const line of lines) {
          const nameMatch = line.match(/name\s*=\s*(.+)/i);
          if (nameMatch) mod.name = nameMatch[1].trim();
          const descMatch = line.match(/description\s*=\s*(.+)/i);
          if (descMatch) mod.description = descMatch[1].trim();
          const authorMatch = line.match(/author\s*=\s*(.+)/i);
          if (authorMatch) mod.author = authorMatch[1].trim();
        }
      }

      if (/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(fileName)) {
        const file = await entry.getFile();
        const blob = URL.createObjectURL(file);
        let priority: 'high' | 'low' = 'low';
        let isIcon = false;
        if (/preview|poster/i.test(fileName)) priority = 'high';
        else if (/icon/i.test(fileName)) isIcon = true;

        const img = new Image();
        await new Promise((resolve) => {
          img.onload = () => {
            candidateImages.push({ url: blob, priority, isIcon, size: { width: img.width, height: img.height } });
            resolve(null);
          };
          img.onerror = () => {
            candidateImages.push({ url: blob, priority, isIcon, size: undefined });
            resolve(null);
          };
          img.src = blob;
        });
      }
    }
  }
}

function createPlaceholderImage(name: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2a2d30';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = '#e65f3c';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.charAt(0).toUpperCase(), 50, 50);
  return canvas.toDataURL();
}
