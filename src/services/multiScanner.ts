import type { TranslationFile } from '../types';
import { getPzLanguageSuffix } from '../constants/languages';
import { scanModFolder } from './scanner';
import type { ScanResult } from './scanner';
import { generateModernFiles, scanModFolderModern } from './scannerModern';

export type MultiScanMode = '42' | '42.15+';

export interface MultiScanProgress {
  current: number;
  total: number;
  currentMod: string;
}

function mergeScanResults(results: ScanResult[]): {
  groups: Record<string, Record<string, Record<string, string>>>;
  newEntries: Record<string, Record<string, string>>;
} {
  const mergedGroups: Record<string, Record<string, Record<string, string>>> = {};
  const mergedNewEntries: Record<string, Record<string, string>> = {};

  for (const result of results) {
    for (const [baseName, langMap] of Object.entries(result.groups)) {
      if (!mergedGroups[baseName]) mergedGroups[baseName] = {};
      for (const [suffix, entries] of Object.entries(langMap)) {
        if (!mergedGroups[baseName][suffix]) mergedGroups[baseName][suffix] = {};
        Object.assign(mergedGroups[baseName][suffix], entries);
      }
    }
    for (const [type, entries] of Object.entries(result.newEntries)) {
      if (!mergedNewEntries[type]) mergedNewEntries[type] = {};
      Object.assign(mergedNewEntries[type], entries);
    }
  }
  return { groups: mergedGroups, newEntries: mergedNewEntries };
}

function generateFilesFromMerged(
  groups: Record<string, Record<string, Record<string, string>>>,
  newEntries: Record<string, Record<string, string>>,
  targetLang: string
): TranslationFile[] {
  const files: TranslationFile[] = [];
  const currentSuffix = getPzLanguageSuffix(targetLang);

  for (const [baseName, langMap] of Object.entries(groups)) {
    const allowedSuffixes = [currentSuffix, 'EN'];
    const allKeys = new Set<string>();

    for (const suffix of allowedSuffixes) {
      if (langMap[suffix]) Object.keys(langMap[suffix]).forEach(k => allKeys.add(k));
    }

    const merged: Record<string, string> = {};
    for (const key of allKeys) {
      let value = null;
      if (langMap[currentSuffix]?.[key] !== undefined) value = langMap[currentSuffix][key];
      else if (langMap['EN']?.[key] !== undefined) value = langMap['EN'][key];
      if (value !== null) merged[key] = value;
    }

    if (newEntries[baseName]) Object.assign(merged, newEntries[baseName]);

    if (Object.keys(merged).length > 0) {
      const fileName = `${baseName}_${currentSuffix}.txt`;
      const content = formatAsFile(`${baseName}_${currentSuffix}`, merged);
      files.push({
        name: fileName,
        originalContent: content,
        workingContent: content,
        committedContent: content
      });
    }
  }

  for (const [type, entries] of Object.entries(newEntries)) {
    if (Object.keys(entries).length > 0 && !groups[type]) {
      const fileName = `${type}_${currentSuffix}.txt`;
      const content = formatAsFile(`${type}_${currentSuffix}`, entries);
      files.push({
        name: fileName,
        originalContent: content,
        workingContent: content,
        committedContent: content
      });
    }
  }
  return files;
}

function formatAsFile(varName: string, obj: Record<string, string>): string {
  const sortedKeys = Object.keys(obj).sort();
  const lines = [`${varName} = {`];
  for (const k of sortedKeys) {
    const v = obj[k];
    const escapedVal = v.replace(/"/g, '\\"');
    lines.push(`    ${k} = "${escapedVal}",`);
  }
  lines.push('}');
  return lines.join('\n');
}

export async function performMultiScan(
  handles: FileSystemDirectoryHandle[],
  targetLang: string,
  mode: MultiScanMode = '42',
  onProgress?: (progress: MultiScanProgress) => void
): Promise<TranslationFile[]> {
  const results: ScanResult[] = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    if (onProgress) onProgress({ current: i + 1, total: handles.length, currentMod: handle.name });

    try {
      const result = mode === '42.15+'
        ? await scanModFolderModern(handle, targetLang)
        : await scanModFolder(handle, targetLang);
      results.push(result as ScanResult);
    } catch (error) {
      console.error(`Error escaneando ${handle.name}:`, error);
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  }

  const { groups, newEntries } = mergeScanResults(results);
  if (mode === '42.15+') {
    return generateModernFiles(groups, newEntries, targetLang);
  }
  return generateFilesFromMerged(groups, newEntries, targetLang);
}
