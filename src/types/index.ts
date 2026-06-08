export interface TranslationFile {
  name: string;
  originalContent: string;
  workingContent: string;
  committedContent: string;
}

export interface Project {
  files: TranslationFile[];
  currFile: number;
}

export interface ModInfo {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  imageUrl: string | null;
  description: string;
  author: string;
}

export interface Extra {
  id: string;
  name: string;
  icon: string;
  action: string;
}

export interface AIConfig {
  enabled: boolean;
  endpoint: string;
  key: string;
  model: string;
  refineMemory: boolean;
}

export interface WorkshopMod {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  imageUrl: string;
  description: string;
  author: string;
  selected?: boolean;
}
export interface ProjectData {
  version: string;
  name: string;
  targetLang: string;
  files: TranslationFile[];
  modSources: string[]; // nombres de los mods (o IDs) que se han fusionado
  settings: {
    leftIdColor: string;
    leftTextColor: string;
    rightIdColor: string;
    rightTextColor: string;
  };
  createdAt: number;
  modifiedAt: number;
}