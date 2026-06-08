import { useState } from 'react';
import type { ProjectData, TranslationFile } from '../types';
import { performMultiScan } from '../services/multiScanner';
import type { MultiScanMode } from '../services/multiScanner';

const STORAGE_KEY_PREFIX = 'kasual_project_';

export function useProject() {
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Crear un nuevo proyecto a partir de mods escaneados
  const createProject = async (
    name: string,
    modHandles: FileSystemDirectoryHandle[],
    targetLang: string,
    mode: MultiScanMode,
    settings: ProjectData['settings']
  ): Promise<ProjectData> => {
    setIsLoading(true);
    try {
      const files = await performMultiScan(modHandles, targetLang, mode);
      const modSources = modHandles.map(h => h.name);
      const now = Date.now();
      const project: ProjectData = {
        version: '1.0',
        name,
        targetLang,
        files,
        modSources,
        settings,
        createdAt: now,
        modifiedAt: now
      };
      setCurrentProject(project);
      return project;
    } finally {
      setIsLoading(false);
    }
  };

  // Añadir mods adicionales a un proyecto existente
  const addModsToProject = async (
    project: ProjectData,
    newModHandles: FileSystemDirectoryHandle[],
    mode: MultiScanMode,
    onProgress?: (current: number, total: number, modName: string) => void
  ): Promise<ProjectData> => {
    setIsLoading(true);
    try {
      // Escanear los nuevos mods
      const newFiles = await performMultiScan(newModHandles, project.targetLang, mode, progress => {
        onProgress?.(progress.current, progress.total, progress.currentMod);
      });
      
      // Fusionar con los archivos existentes
      // Aquí necesitamos una función de fusión similar a la de multiScanner pero preservando los existentes
      const mergedFiles = mergeProjectFiles(project.files, newFiles);
      
      const updatedProject: ProjectData = {
        ...project,
        files: mergedFiles,
        modSources: [...project.modSources, ...newModHandles.map(h => h.name)],
        modifiedAt: Date.now()
      };
      setCurrentProject(updatedProject);
      return updatedProject;
    } finally {
      setIsLoading(false);
    }
  };

  // Guardar proyecto en localStorage (o en archivo)
  const saveProjectToStorage = (project: ProjectData) => {
    const key = `${STORAGE_KEY_PREFIX}${project.name}`;
    localStorage.setItem(key, JSON.stringify(project));
    // También podríamos guardar una lista de proyectos
    updateProjectList(project.name);
  };

  // Cargar proyecto desde localStorage
  const loadProjectFromStorage = (name: string): ProjectData | null => {
    const key = `${STORAGE_KEY_PREFIX}${name}`;
    const data = localStorage.getItem(key);
    if (data) {
      try {
        const project = JSON.parse(data) as ProjectData;
        setCurrentProject(project);
        return project;
      } catch (e) {
        console.error('Error al cargar proyecto:', e);
      }
    }
    return null;
  };

  // Obtener lista de proyectos guardados
  const getProjectList = (): string[] => {
    const list = localStorage.getItem('kasual_project_list');
    return list ? JSON.parse(list) : [];
  };

  const updateProjectList = (name: string) => {
    const list = getProjectList();
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem('kasual_project_list', JSON.stringify(list));
    }
  };

  // Eliminar proyecto
  const deleteProject = (name: string) => {
    const key = `${STORAGE_KEY_PREFIX}${name}`;
    localStorage.removeItem(key);
    const list = getProjectList().filter(n => n !== name);
    localStorage.setItem('kasual_project_list', JSON.stringify(list));
    if (currentProject?.name === name) {
      setCurrentProject(null);
    }
  };

  // Exportar proyecto a archivo JSON (para compartir/backup)
  const exportProjectToFile = (project: ProjectData) => {
    const data = JSON.stringify(project, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.kproject`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importar proyecto desde archivo JSON
  const importProjectFromFile = async (file: File): Promise<ProjectData | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const project = JSON.parse(e.target?.result as string) as ProjectData;
          // Validar estructura básica
          if (project.version && project.name && project.files) {
            setCurrentProject(project);
            // Guardar en localStorage
            saveProjectToStorage(project);
            resolve(project);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    });
  };

  return {
    currentProject,
    isLoading,
    createProject,
    addModsToProject,
    saveProjectToStorage,
    loadProjectFromStorage,
    getProjectList,
    deleteProject,
    exportProjectToFile,
    importProjectFromFile
  };
}

// Función auxiliar para fusionar archivos (simplificada, similar a multiScanner pero preservando existentes)
function mergeProjectFiles(
  existing: TranslationFile[],
  newFiles: TranslationFile[]
): TranslationFile[] {
  // Crear mapa por nombre de archivo
  const fileMap = new Map<string, TranslationFile>();
  existing.forEach(f => fileMap.set(f.name, f));
  
  // Para cada nuevo archivo, si ya existe, fusionar contenido? 
  // Por ahora, simplemente reemplazar (o podríamos implementar fusión línea por línea)
  newFiles.forEach(f => {
    // Si ya existe, podríamos combinar, pero es complejo. 
    // Lo simple: sobreescribir (el último mod tiene prioridad)
    fileMap.set(f.name, f);
  });
  
  return Array.from(fileMap.values());
}
