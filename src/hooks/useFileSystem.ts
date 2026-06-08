import { useState } from 'react';
import type { TranslationFile, Project } from '../types';
import { scanModFolder } from '../services/scanner';
import { scanModFolderModern } from '../services/scannerModern';
import { legacyToModern, modernToLegacy } from '../services/converter';

export type ScanMode = '42' | '42.15+';

export function useFileSystem() {
  const [project, setProject] = useState<Project>({ files: [], currFile: -1 });
  const [currentDirectoryHandle, setCurrentDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [scanSkipped, setScanSkipped] = useState<string[]>([]);

  const loadModFolder = async (targetLang: string = 'es', mode: ScanMode = '42') => {
    try {
      const handle = await window.showDirectoryPicker();
      setCurrentDirectoryHandle(handle);
      setIsScanning(true);
      setScanErrors([]);
      setScanSkipped([]);

      let result;
      if (mode === '42.15+') {
        result = await scanModFolderModern(handle, targetLang);
      } else {
        result = await scanModFolder(handle, targetLang);
      }

      setProject({
        files: result.files,
        currFile: result.files.length > 0 ? 0 : -1
      });
      setScanErrors(result.errors);
      setScanSkipped(result.skipped);

      setIsScanning(false);
      return {
        handle,
        fileCount: result.files.length,
        errorCount: result.errors.length,
        skippedCount: result.skipped.length
      };
    } catch (e) {
      console.error('Error al seleccionar carpeta:', e);
      setIsScanning(false);
      throw e;
    }
  };

  // Convertir todos los archivos del proyecto a otro formato
  const convertFiles = (targetMode: ScanMode) => {
    setProject(prev => {
      const newFiles = prev.files.map(file => {
        const isJson = file.name.endsWith('.json');
        const wantJson = targetMode === '42.15+';

        // Si ya está en el formato deseado, no cambiar
        if (isJson === wantJson) return file;

        if (wantJson) {
          // Convertir de legacy a moderno (txt -> json)
          const newContent = legacyToModern(file.workingContent, file.name);
          const newName = file.name.replace('.txt', '.json');
          return {
            ...file,
            name: newName,
            originalContent: newContent,
            workingContent: newContent,
            committedContent: newContent
          };
        } else {
          // Convertir de moderno a legacy (json -> txt)
          const newContent = modernToLegacy(file.workingContent, file.name);
          const newName = file.name.replace('.json', '.txt');
          return {
            ...file,
            name: newName,
            originalContent: newContent,
            workingContent: newContent,
            committedContent: newContent
          };
        }
      });
      return { ...prev, files: newFiles };
    });
  };

  const setProjectFiles = (files: TranslationFile[]) => {
    setProject({
      files,
      currFile: files.length > 0 ? 0 : -1
    });
  };

  const selectFile = (index: number) => {
    setProject(prev => ({ ...prev, currFile: index }));
  };

  const updateCurrentFile = (content: string) => {
    setProject(prev => {
      if (prev.currFile === -1) return prev;
      const newFiles = [...prev.files];
      newFiles[prev.currFile] = {
        ...newFiles[prev.currFile],
        workingContent: content
      };
      return { ...prev, files: newFiles };
    });
  };

  const saveCurrentFile = () => {
    setProject(prev => {
      if (prev.currFile === -1) return prev;
      const newFiles = [...prev.files];
      newFiles[prev.currFile] = {
        ...newFiles[prev.currFile],
        committedContent: newFiles[prev.currFile].workingContent
      };
      return { ...prev, files: newFiles };
    });
  };

  return {
    project,
    currentDirectoryHandle,
    isScanning,
    scanErrors,
    scanSkipped,
    loadModFolder,
    setProjectFiles,
    convertFiles,
    selectFile,
    updateCurrentFile,
    saveCurrentFile
  };
}
