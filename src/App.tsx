import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFileSystem } from './hooks/useFileSystem';
import type { ScanMode } from './hooks/useFileSystem';
import { useTranslation } from './hooks/useTranslation';
import { useExtras } from './hooks/useExtras';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { exportLocal, exportWorkshop, downloadBlob } from './services/export';
import type { ExportOptions } from './services/export';
import type { TranslationEngine } from './services/translator';
import { performMultiScan } from './services/multiScanner';
import { scanModFolder } from './services/scanner';
import { scanModFolderModern } from './services/scannerModern';
import { modernToLegacy } from './services/converter';
import { TARGET_LANGUAGES, SUPPORTED_PZ_LANGUAGE_SUFFIXES, getCanonicalPzLanguageSuffix, getLanguageLabel, getPzLanguageSuffix, normalizeLanguageCode } from './constants/languages';
import { createTranslator } from './i18n';
import {
  FaBolt,
  FaBoxOpen,
  FaCheck,
  FaCogs,
  FaDatabase,
  FaEye,
  FaFileAlt,
  FaFolderOpen,
  FaHammer,
  FaKey,
  FaLanguage,
  FaLayerGroup,
  FaPlus,
  FaQuestionCircle,
  FaRobot,
  FaSearch,
  FaSave,
  FaTrash,
  FaUndo,
  FaHistory
} from 'react-icons/fa';
import FileList from './components/FileList';
import CodeMirrorEditor from './components/CodeMirrorEditor';
import type { CodeMirrorEditorHandle } from './components/CodeMirrorEditor';
import DiffView from './components/DiffView';
import DiffNavigation from './components/DiffNavigation';
import ProgressBar from './components/ProgressBar';
import ColorPicker from './components/ColorPicker';
import TranslateModal from './components/TranslateModal';
import ExportModal from './components/ExportModal';
import ExtrasModal from './components/ExtrasModal';
import WorkshopModal from './components/WorkshopModal';
import HelpModal from './components/HelpModal';
import PreviewModal from './components/PreviewModal';
import ThemeToggle from './components/ThemeToggle';
import AIAssistantModal from './components/AIAssistantModal';
import kasualLogo from './assets/kasual-logo-small.png';
import kasualMascotLogo from './assets/kasual-mascot-transparent.png';
import kasualTerminalLogo from './assets/kasual-logo-terminal.png';
import kasualProjectLogo from './assets/kasual-logo-project.png';
import './App.css';

type ProjectJsonFile = {
  name: string;
  path: string;
  handle: FileSystemFileHandle | null;
  content: string;
  workingContent: string;
  keyCount: number;
  duplicateKeys: string[];
  parseError?: string;
};

type ProjectConflict = {
  key: string;
  files: string[];
};

type StagedModFile = {
  name: string;
  workingContent: string;
  newKeys: string[];
  mergedKeys: string[];
  duplicateKeys: Array<{ key: string; files: string[] }>;
};

type SavedProjectHandle = {
  id: string;
  name: string;
  mode: ScanMode;
  targetLang?: string;
  lastFilePath?: string;
  projectSearch?: string;
  handle: FileSystemDirectoryHandle;
  savedAt: number;
};

type ChangeFilter = 'all' | 'new' | 'duplicate' | 'edited';

type ProjectHistoryItem = {
  id: string;
  label: string;
  detail: string;
  createdAt: number;
  undo?: ProjectUndoSnapshot;
};

type ProjectUndoSnapshot = {
  label: string;
  files: ProjectJsonFile[];
  stagedFiles: StagedModFile[];
  projectIndex: number;
  stagedIndex: number;
  showAddModPanel: boolean;
};

type ProjectValidationIssue = {
  id: string;
  severity: 'ok' | 'warning' | 'error';
  label: string;
  detail: string;
  filePath?: string;
};

type AppToast = {
  id: number;
  message: string;
  source: 'translator' | 'project';
};

type AdvancedProjectFilter = 'all' | 'pending' | 'duplicates' | 'empty' | 'errors' | 'new';
type CodeMirrorCommandEditor = CodeMirrorEditorHandle['getEditor'] extends () => infer T
  ? NonNullable<T> & { execCommand: (command: string) => void }
  : never;

const PROJECT_DB_NAME = 'kasual-translate-projects';
const PROJECT_STORE_NAME = 'projects';

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function loadSavedProjectHandles(): Promise<SavedProjectHandle[]> {
  const db = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE_NAME, 'readonly');
    const request = transaction.objectStore(PROJECT_STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve((request.result as SavedProjectHandle[]).sort((a, b) => b.savedAt - a.savedAt));
    };
  });
}

async function saveProjectHandle(project: SavedProjectHandle): Promise<void> {
  const db = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(PROJECT_STORE_NAME).put(project);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function ensureDirectoryPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const options = { mode: 'readwrite' as const };
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if (await handle.queryPermission(options) === 'granted') return true;
  return await handle.requestPermission(options) === 'granted';
}

function extractJsonKeys(content: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let current = '';
  let lastString: string | null = null;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        current += char;
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
        lastString = current;
        current = '';
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      current = '';
      continue;
    }

    if (char === '{') {
      depth += 1;
      lastString = null;
      continue;
    }

    if (char === '}') {
      depth = Math.max(0, depth - 1);
      lastString = null;
      continue;
    }

    if (char === ':' && depth === 1 && lastString) {
      keys.push(lastString);
      lastString = null;
      continue;
    }

    if (!/\s/.test(char)) {
      if (char !== ':') lastString = null;
    }
  }

  return keys;
}

function extractLegacyKeys(content: string): string[] {
  const keys: string[] = [];
  const regex = /^\s*([a-zA-Z0-9_.-]+)\s*=/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    keys.push(match[1]);
  }

  return keys;
}

function extractKeysByFile(content: string, fileName: string): string[] {
  return fileName.toLowerCase().endsWith('.json') ? extractJsonKeys(content) : extractLegacyKeys(content);
}

function parseTranslationContent(content: string, fileName: string): Record<string, string> {
  if (fileName.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
  }

  const entries: Record<string, string> = {};
  const regex = /^\s*([a-zA-Z0-9_.-]+)\s*=\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    entries[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return entries;
}

function validateTranslationContent(content: string, fileName: string): string | undefined {
  if (fileName.toLowerCase().endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'JSON root must be an object';
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid JSON';
    }
  }

  const wrapper = content.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*\{([\s\S]*)\}\s*$/);
  if (!wrapper) return 'Legacy TXT must use Name = { ... }';

  const invalidLines = wrapper[2]
    .split('\n')
    .map((line, index) => ({ line: line.trim(), index: index + 2 }))
    .filter(({ line }) => line.length > 0 && !/^[a-zA-Z0-9_.-]+\s*=\s*"((?:\\.|[^"\\])*)"\s*,?$/.test(line));

  if (invalidLines.length > 0) return `Invalid TXT line ${invalidLines[0].index}: ${invalidLines[0].line}`;
  return undefined;
}

function stringifyTranslationContent(entries: Record<string, string>, fileName: string): string {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  if (fileName.toLowerCase().endsWith('.json')) return `${JSON.stringify(sorted, null, 2)}\n`;
  return modernToLegacy(JSON.stringify(sorted, null, 2), fileName.replace(/\.txt$/i, '.json'));
}

function splitTranslationFileName(fileName: string): { typeName: string; extension: string; languageSuffix: string | null } {
  const extensionMatch = fileName.match(/\.(json|txt)$/i);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '';
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const suffixMatch = baseName.match(/^(.*)_([A-Z]{2,4})$/i);

  if (suffixMatch) {
    const candidate = getCanonicalPzLanguageSuffix(suffixMatch[2]);
    if (SUPPORTED_PZ_LANGUAGE_SUFFIXES.has(candidate)) {
      return { typeName: suffixMatch[1], extension, languageSuffix: candidate };
    }
  }

  return { typeName: baseName, extension, languageSuffix: null };
}

function getTranslationTypeName(fileName: string): string {
  return splitTranslationFileName(fileName).typeName;
}

function getDisplayTranslationFileName(fileName: string): string {
  const { typeName, extension } = splitTranslationFileName(fileName);
  return `${typeName}${extension || (fileName.toLowerCase().endsWith('.json') ? '.json' : '.txt')}`;
}

function getFormattedTranslationName(fileName: string, mode: ScanMode): string {
  const typeName = getTranslationTypeName(fileName);
  return mode === '42.15+' ? `${typeName}.json` : `${typeName}.txt`;
}

function convertTranslationDocument(content: string, fileName: string, mode: ScanMode) {
  const wantJson = mode === '42.15+';
  const isJson = fileName.toLowerCase().endsWith('.json');
  const nextName = getFormattedTranslationName(fileName, mode);
  if (wantJson === isJson && fileName === nextName) return { name: nextName, content };

  const entries = parseTranslationContent(content, fileName);
  return {
    name: nextName,
    content: stringifyTranslationContent(entries, nextName)
  };
}

function replaceFileNameInPath(filePath: string, nextName: string): string {
  const parts = filePath.split('/');
  parts[parts.length - 1] = nextName;
  return parts.join('/');
}

function analyzeTranslationContent(content: string, fileName: string) {
  const keys = extractKeysByFile(content, fileName);
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  const parseError = validateTranslationContent(content, fileName);

  return {
    keyCount: seen.size,
    duplicateKeys: Array.from(duplicates).sort(),
    parseError
  };
}

function findEmptyTranslationEntries(content: string, fileName: string): string[] {
  try {
    return Object.entries(parseTranslationContent(content, fileName))
      .filter(([, value]) => String(value).trim().length === 0)
      .map(([key]) => key)
      .sort();
  } catch {
    return [];
  }
}

function validatePzFileName(fileName: string, mode: ScanMode, targetLang: string): string | undefined {
  const expectedExtension = mode === '42.15+' ? '.json' : '.txt';
  if (!fileName.toLowerCase().endsWith(expectedExtension)) return `Expected ${expectedExtension}`;
  const suffix = splitTranslationFileName(fileName).languageSuffix;
  const expectedSuffix = getPzLanguageSuffix(targetLang);
  if (suffix && suffix !== expectedSuffix) return `Expected _${expectedSuffix}`;
  return undefined;
}

function isDirectoryPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getFileHandleByPath(directory: FileSystemDirectoryHandle, filePath: string, create = false): Promise<FileSystemFileHandle> {
  const parts = filePath.split('/').filter(Boolean);
  let current = directory;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current.getFileHandle(parts[parts.length - 1], { create });
}

function cloneProjectFiles(files: ProjectJsonFile[]): ProjectJsonFile[] {
  return files.map(file => ({ ...file, duplicateKeys: [...file.duplicateKeys] }));
}

function cloneStagedFiles(files: StagedModFile[]): StagedModFile[] {
  return files.map(file => ({
    ...file,
    newKeys: [...file.newKeys],
    mergedKeys: [...file.mergedKeys],
    duplicateKeys: file.duplicateKeys.map(duplicate => ({ ...duplicate, files: [...duplicate.files] }))
  }));
}

async function collectProjectFiles(directory: FileSystemDirectoryHandle, mode: ScanMode, basePath = ''): Promise<ProjectJsonFile[]> {
  const files: ProjectJsonFile[] = [];
  const extension = mode === '42.15+' ? '.json' : '.txt';

  for await (const entry of directory.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      files.push(...await collectProjectFiles(entry, mode, entryPath));
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(extension)) continue;

    const file = await entry.getFile();
    const content = await file.text();
    const analysis = analyzeTranslationContent(content, entry.name);
    files.push({
      name: entry.name,
      path: entryPath,
      handle: entry,
      content,
      workingContent: content,
      ...analysis
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function getProjectConflicts(files: ProjectJsonFile[]): ProjectConflict[] {
  const owners = new Map<string, Set<string>>();

  for (const file of files) {
    const uniqueKeys = new Set(extractKeysByFile(file.workingContent, file.name));
    for (const key of uniqueKeys) {
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)?.add(file.path);
    }
  }

  return Array.from(owners.entries())
    .filter(([, fileSet]) => fileSet.size > 1)
    .map(([key, fileSet]) => ({ key, files: Array.from(fileSet).sort() }))
    .sort((a, b) => b.files.length - a.files.length || a.key.localeCompare(b.key));
}

function App() {
  const {
    project,
    currentDirectoryHandle,
    isScanning,
    scanErrors,
    loadModFolder,
    setProjectFiles,
    convertFiles,
    selectFile,
    updateCurrentFile,
    saveCurrentFile
  } = useFileSystem();

  const { isTranslating, progress, translateFile } = useTranslation();
  const {
    extras,
    addExtra,
    updateExtra,
    deleteExtra,
    executeExtra,
    importExtras,
    exportExtras
  } = useExtras();

  const [targetLang, setTargetLang] = useState(() => {
    const stored = normalizeLanguageCode(localStorage.getItem('kasual_target_lang'));
    return TARGET_LANGUAGES.some(language => language.code === stored) ? stored : 'es';
  });
  const [scanMode, setScanMode] = useState<ScanMode>('42');
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [showWorkshopModal, setShowWorkshopModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [multiScanProgress, setMultiScanProgress] = useState<{ current: number; total: number; currentMod: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status'>('name');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [appToasts, setAppToasts] = useState<AppToast[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<'translator' | 'projects' | null>(null);
  const [projectPackName, setProjectPackName] = useState('');
  const [projectPackDirectoryHandle, setProjectPackDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [projectPackFiles, setProjectPackFiles] = useState<ProjectJsonFile[]>([]);
  const [projectPackIndex, setProjectPackIndex] = useState(-1);
  const [projectPackMode, setProjectPackMode] = useState<ScanMode>('42.15+');
  const [savedProjects, setSavedProjects] = useState<SavedProjectHandle[]>([]);
  const [savedProjectId, setSavedProjectId] = useState('');
  const [showSavedProjectMenu, setShowSavedProjectMenu] = useState(false);
  const [projectPackSearch, setProjectPackSearch] = useState('');
  const [projectAdvancedFilter, setProjectAdvancedFilter] = useState<AdvancedProjectFilter>('all');
  const [isProjectPackLoading, setIsProjectPackLoading] = useState(false);
  const [projectPackFeedback, setProjectPackFeedback] = useState<string | null>(null);
  const [savePulse, setSavePulse] = useState(false);
  const [projectConsole, setProjectConsole] = useState<ProjectHistoryItem[]>([]);
  const [extraKey, setExtraKey] = useState('');
  const [extraValue, setExtraValue] = useState('');
  const [showAddModPanel, setShowAddModPanel] = useState(false);
  const [stagedModName, setStagedModName] = useState('');
  const [stagedModFiles, setStagedModFiles] = useState<StagedModFile[]>([]);
  const [stagedModIndex, setStagedModIndex] = useState(-1);
  const [stagedUndoSnapshot, setStagedUndoSnapshot] = useState<StagedModFile[] | null>(null);
  const [isScanningProjectMod, setIsScanningProjectMod] = useState(false);
  const [isTranslatingProjectMod, setIsTranslatingProjectMod] = useState(false);
  const [previewDuplicateKey, setPreviewDuplicateKey] = useState<string | null>(null);
  const [stagedChangeFilter, setStagedChangeFilter] = useState<ChangeFilter>('all');
  const [projectGlobalSearch, setProjectGlobalSearch] = useState('');
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryItem[]>([]);
  const [projectUndoStack, setProjectUndoStack] = useState<ProjectUndoSnapshot[]>([]);
  const [showProjectCompare, setShowProjectCompare] = useState(false);
  const [showPendingChanges, setShowPendingChanges] = useState(false);

  const [leftIdColor, setLeftIdColor] = useState(() => localStorage.getItem('kasual_left_id_color') || '#F5A645');
  const [leftTextColor, setLeftTextColor] = useState(() => localStorage.getItem('kasual_left_text_color') || '#f1fa8c');
  const [rightIdColor, setRightIdColor] = useState(() => localStorage.getItem('kasual_right_id_color') || '#F5A645');
  const [rightTextColor, setRightTextColor] = useState(() => localStorage.getItem('kasual_right_text_color') || '#f1fa8c');

  const [showLeftIdPicker, setShowLeftIdPicker] = useState(false);
  const [showLeftTextPicker, setShowLeftTextPicker] = useState(false);
  const [showRightIdPicker, setShowRightIdPicker] = useState(false);
  const [showRightTextPicker, setShowRightTextPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });

  const editorRef = useRef<CodeMirrorEditorHandle>(null);
  const leftNumbersRef = useRef<HTMLDivElement>(null);
  const targetPreviewRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);
  const t = createTranslator(targetLang);

  useEffect(() => { localStorage.setItem('kasual_target_lang', targetLang); }, [targetLang]);
  useEffect(() => { localStorage.setItem('kasual_left_id_color', leftIdColor); }, [leftIdColor]);
  useEffect(() => { localStorage.setItem('kasual_left_text_color', leftTextColor); }, [leftTextColor]);
  useEffect(() => { localStorage.setItem('kasual_right_id_color', rightIdColor); }, [rightIdColor]);
  useEffect(() => { localStorage.setItem('kasual_right_text_color', rightTextColor); }, [rightTextColor]);
  useEffect(() => {
    loadSavedProjectHandles()
      .then(setSavedProjects)
      .catch(() => setSavedProjects([]));
  }, []);

  useEffect(() => {
    if (!projectPackFeedback) return;
    const timer = window.setTimeout(() => setProjectPackFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [projectPackFeedback]);

  useEffect(() => {
    if (!saveFeedback) return;
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    const nextToast: AppToast = { id, message: saveFeedback, source: 'translator' };
    setAppToasts(previous => [...previous, nextToast].slice(-3));
    const timer = window.setTimeout(() => {
      setAppToasts(previous => previous.filter(toast => toast.id !== id));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);

  useEffect(() => {
    if (!projectPackFeedback) return;
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    const nextToast: AppToast = { id, message: projectPackFeedback, source: 'project' };
    setAppToasts(previous => [...previous, nextToast].slice(-3));
    const timer = window.setTimeout(() => {
      setAppToasts(previous => previous.filter(toast => toast.id !== id));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [projectPackFeedback]);

  useEffect(() => {
    if (workspaceMode !== 'projects' || projectPackFiles.length === 0) return;
    const session = {
      projectPackName,
      projectPackMode,
      targetLang,
      projectPackSearch,
      projectAdvancedFilter,
      projectPackIndex,
      files: projectPackFiles.map(file => ({ ...file, handle: null })),
      stagedModName,
      stagedModFiles,
      stagedModIndex,
      showAddModPanel
    };
    localStorage.setItem('kasual_project_session', JSON.stringify(session));
  }, [workspaceMode, projectPackName, projectPackMode, targetLang, projectPackSearch, projectAdvancedFilter, projectPackIndex, projectPackFiles, stagedModName, stagedModFiles, stagedModIndex, showAddModPanel]);

  const addProjectHistory = (label: string, detail: string, undo?: ProjectUndoSnapshot) => {
    const item = { id: crypto.randomUUID(), label, detail, createdAt: Date.now(), undo };
    setProjectHistory(prev => [item, ...prev].slice(0, 24));
    setProjectConsole(prev => [item, ...prev].slice(0, 8));
    if (undo) setProjectUndoStack(prev => [undo, ...prev].slice(0, 12));
  };

  const captureProjectSnapshot = (label: string): ProjectUndoSnapshot => ({
    label,
    files: cloneProjectFiles(projectPackFiles),
    stagedFiles: cloneStagedFiles(stagedModFiles),
    projectIndex: projectPackIndex,
    stagedIndex: stagedModIndex,
    showAddModPanel
  });

  const restoreProjectSnapshot = (snapshot?: ProjectUndoSnapshot) => {
    if (!snapshot) return;
    setProjectPackFiles(cloneProjectFiles(snapshot.files));
    setStagedModFiles(cloneStagedFiles(snapshot.stagedFiles));
    setProjectPackIndex(snapshot.projectIndex);
    setStagedModIndex(snapshot.stagedIndex);
    setShowAddModPanel(snapshot.showAddModPanel);
    setPreviewDuplicateKey(null);
    setProjectPackFeedback(t('snapshot_restored', snapshot.label));
    setProjectUndoStack(prev => prev.filter(item => item !== snapshot));
  };

  const openPicker = (setter: React.Dispatch<React.SetStateAction<boolean>>, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const pickerWidth = 220;
    const pickerHeight = 128;
    const margin = 12;
    const x = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - pickerWidth - margin));
    const preferredY = rect.bottom + 8;
    const y = preferredY + pickerHeight > window.innerHeight - margin
      ? Math.max(margin, rect.top - pickerHeight - 8)
      : preferredY;
    setShowLeftIdPicker(false);
    setShowLeftTextPicker(false);
    setShowRightIdPicker(false);
    setShowRightTextPicker(false);
    setPickerPosition({ x, y });
    setter(true);
  };

  const currentFile = project.currFile !== -1 ? project.files[project.currFile] : null;
  const hasUnsavedChanges = !!currentFile && currentFile.workingContent !== currentFile.committedContent;
  const pendingFiles = project.files.filter(file => file.workingContent !== file.committedContent).length;
  const targetLanguageLabel = getLanguageLabel(targetLang);
  const statusText = multiScanProgress
    ? t('status_workshop', multiScanProgress.current, multiScanProgress.total)
    : isScanning
      ? t('status_scanning')
      : isTranslating
        ? t('status_translating', progress.current, progress.total)
        : pendingFiles > 0
          ? t('status_pending', pendingFiles)
          : t('status_ready');
  const showEmptyDashboard = !isScanning && !multiScanProgress && project.currFile === -1 && project.files.length === 0;
  const showProjectWorkspace = workspaceMode === 'projects';
  const showStartScreen = showEmptyDashboard && workspaceMode !== 'projects';
  const isStandaloneScreen = showStartScreen || showProjectWorkspace;
  const selectedProjectFile = projectPackIndex !== -1 ? projectPackFiles[projectPackIndex] : null;
  const selectedStagedModFile = stagedModIndex !== -1 ? stagedModFiles[stagedModIndex] : null;
  const projectConflicts = useMemo(() => getProjectConflicts(projectPackFiles), [projectPackFiles]);
  const filteredProjectFiles = useMemo(() => projectPackFiles.filter(file => {
    const needle = projectPackSearch.trim().toLowerCase();
    const matchesSearch = !needle || file.path.toLowerCase().includes(needle) || file.workingContent.toLowerCase().includes(needle);
    if (!matchesSearch) return false;
    if (projectAdvancedFilter === 'pending') return file.workingContent !== file.content;
    if (projectAdvancedFilter === 'duplicates') return file.duplicateKeys.length > 0 || projectConflicts.some(conflict => conflict.files.includes(file.path));
    if (projectAdvancedFilter === 'empty') return findEmptyTranslationEntries(file.workingContent, file.name).length > 0;
    if (projectAdvancedFilter === 'errors') return !!file.parseError;
    if (projectAdvancedFilter === 'new') return !file.handle;
    return true;
  }), [projectPackFiles, projectPackSearch, projectAdvancedFilter, projectConflicts]);
  const projectKeyLocations = useMemo(() => {
    const locationsByKey = new Map<string, string[]>();
    for (const file of projectPackFiles) {
      for (const key of new Set(extractKeysByFile(file.workingContent, file.name))) {
        const locations = locationsByKey.get(key) || [];
        locations.push(file.path);
        locationsByKey.set(key, locations);
      }
    }
    return locationsByKey;
  }, [projectPackFiles]);
  const stagedTotals = useMemo(() => stagedModFiles.reduce(
    (acc, file) => ({
      newKeys: acc.newKeys + file.newKeys.length,
      duplicates: acc.duplicates + file.duplicateKeys.length
    }),
    { newKeys: 0, duplicates: 0 }
  ), [stagedModFiles]);
  const selectedTargetProjectFile = useMemo(() => selectedStagedModFile
    ? projectPackFiles.find(file => getTranslationTypeName(file.name) === getTranslationTypeName(selectedStagedModFile.name)) || null
    : null, [projectPackFiles, selectedStagedModFile]);
  const { selectedStagedEntries, selectedTargetEntries } = useMemo(() => {
    try {
      return {
        selectedStagedEntries: selectedStagedModFile ? parseTranslationContent(selectedStagedModFile.workingContent, selectedStagedModFile.name) : {},
        selectedTargetEntries: selectedTargetProjectFile ? parseTranslationContent(selectedTargetProjectFile.workingContent, selectedTargetProjectFile.name) : {}
      };
    } catch {
      return {
        selectedStagedEntries: {},
        selectedTargetEntries: {}
      };
    }
  }, [selectedStagedModFile, selectedTargetProjectFile]);
  const selectedStagedRows = useMemo(() => selectedStagedModFile
    ? [
        ...selectedStagedModFile.newKeys.map(key => ({ key, status: 'new' as const, files: [] as string[] })),
        ...selectedStagedModFile.mergedKeys.map(key => ({ key, status: 'merged' as const, files: [] as string[] })),
        ...selectedStagedModFile.duplicateKeys.map(duplicate => ({ key: duplicate.key, status: 'duplicate' as const, files: duplicate.files }))
      ]
    : [], [selectedStagedModFile]);
  const filteredStagedRows = useMemo(() => selectedStagedRows.filter(row => {
    if (stagedChangeFilter === 'all') return true;
    if (stagedChangeFilter === 'edited') {
      return selectedStagedEntries[row.key] !== selectedTargetEntries[row.key];
    }
    return row.status === stagedChangeFilter;
  }), [selectedStagedRows, stagedChangeFilter, selectedStagedEntries, selectedTargetEntries]);
  const selectedTargetPreviewContent = selectedStagedModFile
    ? stringifyTranslationContent(
        {
          ...selectedTargetEntries,
          ...Object.fromEntries(
            filteredStagedRows
              .filter(row => row.status === 'new')
              .map(row => [row.key, selectedStagedEntries[row.key] || ''])
          )
        },
        selectedTargetProjectFile?.name || selectedStagedModFile.name
      )
    : '';
  void selectedTargetPreviewContent;
  const selectedTargetRows = useMemo(() => [
    ...Object.entries(selectedTargetEntries).map(([key, value]) => ({ key, value, status: 'current' as const, files: [] as string[] })),
    ...filteredStagedRows.map(row => ({
      ...row,
      value: row.status === 'duplicate'
        ? (selectedTargetEntries[row.key] || t('duplicate_found_other_document'))
        : (selectedStagedEntries[row.key] || '')
    }))
  ], [selectedTargetEntries, filteredStagedRows, selectedStagedEntries, t]);
  const projectSaveSummary = useMemo(() => {
    const dirtyFiles = projectPackFiles.filter(file => file.workingContent !== file.content);
    return {
      dirtyFiles,
      invalidFiles: projectPackFiles.filter(file => !!file.parseError),
      newKeys: stagedTotals.newKeys,
      duplicates: stagedTotals.duplicates,
      stagedFiles: stagedModFiles.length
    };
  }, [projectPackFiles, stagedTotals.newKeys, stagedTotals.duplicates, stagedModFiles.length]);
  const projectBarStats = {
    documents: showAddModPanel && stagedModFiles.length > 0 ? stagedModFiles.length : projectPackFiles.length,
    newKeys: stagedTotals.newKeys,
    duplicates: showAddModPanel && stagedTotals.duplicates > 0 ? stagedTotals.duplicates : projectConflicts.length,
    errors: projectSaveSummary.invalidFiles.length
  };
  const projectValidationIssues = useMemo<ProjectValidationIssue[]>(() => {
    const issues: ProjectValidationIssue[] = [];
    for (const file of projectPackFiles) {
      const nameError = validatePzFileName(file.name, projectPackMode, targetLang);
      if (nameError) {
        issues.push({
          id: `name-${file.path}`,
          severity: 'warning',
          label: t('validation_bad_suffix'),
          detail: `${getDisplayTranslationFileName(file.name)} · ${nameError}`,
          filePath: file.path
        });
      }
      if (file.parseError) {
        issues.push({
          id: `parse-${file.path}`,
          severity: 'error',
          label: t('validation_invalid_format'),
          detail: `${getDisplayTranslationFileName(file.name)} · ${file.parseError}`,
          filePath: file.path
        });
      }
      if (file.duplicateKeys.length > 0) {
        issues.push({
          id: `internal-duplicates-${file.path}`,
          severity: 'warning',
          label: t('validation_internal_duplicates'),
          detail: `${getDisplayTranslationFileName(file.name)} · ${file.duplicateKeys.slice(0, 3).join(', ')}`,
          filePath: file.path
        });
      }
      const emptyKeys = findEmptyTranslationEntries(file.workingContent, file.name);
      if (emptyKeys.length > 0) {
        issues.push({
          id: `empty-${file.path}`,
          severity: 'warning',
          label: t('validation_empty_text'),
          detail: `${getDisplayTranslationFileName(file.name)} · ${emptyKeys.slice(0, 3).join(', ')}`,
          filePath: file.path
        });
      }
      if (file.workingContent !== file.content) {
        issues.push({
          id: `dirty-${file.path}`,
          severity: 'warning',
          label: t('validation_pending_save'),
          detail: getDisplayTranslationFileName(file.name),
          filePath: file.path
        });
      }
    }
    for (const conflict of projectConflicts.slice(0, 12)) {
      issues.push({
        id: `conflict-${conflict.key}`,
        severity: 'warning',
        label: t('validation_cross_duplicates'),
        detail: `${conflict.key} · ${t('file_count', conflict.files.length)}`,
        filePath: conflict.files[0]
      });
    }
    if (showAddModPanel && stagedTotals.duplicates > 0) {
      issues.push({
        id: 'staged-duplicates',
        severity: 'warning',
        label: t('validation_staged_duplicates'),
        detail: t('duplicate_count', stagedTotals.duplicates)
      });
    }
    return issues;
  }, [projectPackFiles, projectConflicts, showAddModPanel, stagedTotals.duplicates, projectPackMode, targetLang, t]);
  const projectSearchResults = useMemo(() => {
    const needle = projectGlobalSearch.trim().toLowerCase();
    if (!needle) return [];
    return projectPackFiles.flatMap((file, fileIndex) => {
      let entries: Record<string, string> = {};
      try {
        entries = parseTranslationContent(file.workingContent, file.name);
      } catch {
        return [];
      }
      return Object.entries(entries)
        .filter(([key, value]) => key.toLowerCase().includes(needle) || value.toLowerCase().includes(needle))
        .slice(0, 30)
        .map(([key, value]) => ({ fileIndex, file, key, value }));
    }).slice(0, 60);
  }, [projectGlobalSearch, projectPackFiles]);
  const formatPreviewKey = (key: string, fileName: string) => (
    fileName.toLowerCase().endsWith('.json') ? `"${key}"` : key
  );
  useEffect(() => {
    if (currentFile && leftNumbersRef.current) {
      leftNumbersRef.current.scrollTop = 0;
    }
    if (currentFile && editorRef.current) {
      const cm = editorRef.current.getEditor();
      if (cm) {
        cm.refresh();
        cm.scrollTo(0, 0);
      }
    }
  }, [currentFile]);

  useEffect(() => {
    if (!targetPreviewRef.current || !selectedStagedModFile) return;
    if (filteredStagedRows.length === 0) return;
    const line = Math.max(0, selectedTargetRows.length - filteredStagedRows.length - 2);
    targetPreviewRef.current.scrollTop = Math.max(0, line * 22);
  }, [selectedStagedModFile, selectedTargetRows.length, filteredStagedRows.length, stagedChangeFilter]);

  const totalKeys = project.files.reduce((acc, file) => {
    if (file.name.endsWith('.json')) {
      try {
        const data = JSON.parse(file.workingContent);
        return acc + (data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).length : 0);
      } catch {
        return acc;
      }
    }
    const lines = file.workingContent.split('\n');
    return acc + lines.filter(line => /^\s*[a-zA-Z0-9_.-]+\s*=/.test(line)).length;
  }, 0);

  const handleNextFile = () => {
    if (project.files.length === 0) return;
    const nextIndex = (project.currFile + 1) % project.files.length;
    selectFile(nextIndex);
  };
  const handlePrevFile = () => {
    if (project.files.length === 0) return;
    const prevIndex = (project.currFile - 1 + project.files.length) % project.files.length;
    selectFile(prevIndex);
  };
  const handleNextDiff = () => {};
  const handleSearch = () => {
    const cm = editorRef.current?.getEditor();
    if (cm) (cm as CodeMirrorCommandEditor).execCommand('find');
  };

  const handleSaveCurrentFile = () => {
    if (!currentFile) return;

    if (!hasUnsavedChanges) {
      setSaveFeedback(t('no_pending_changes'));
      window.setTimeout(() => setSaveFeedback(null), 1400);
      return;
    }

    saveCurrentFile();
    setSaveFeedback(t('saved_current_file', currentFile.name));
    window.setTimeout(() => setSaveFeedback(null), 1400);
  };

  useKeyboardShortcuts({
    onSave: handleSaveCurrentFile,
    onNextFile: handleNextFile,
    onPrevFile: handlePrevFile,
    onNextDiff: handleNextDiff,
    onSearch: handleSearch,
    onPreview: () => setShowPreviewModal(true)
  });

  const handleLoadFolder = async () => {
    try {
      setWorkspaceMode('translator');
      const result = await loadModFolder(targetLang, scanMode);
      if (result.fileCount === 0) {
        setSaveFeedback(t('scan_complete', 0));
      } else if (result.errorCount > 0) {
        setSaveFeedback(t('scan_completed_with_errors', result.errorCount));
      }
    } catch (error) {
      setSaveFeedback(`${t('scan_error')}: ${getErrorMessage(error)}`);
      if (project.files.length === 0) setWorkspaceMode(null);
    }
  };

  const loadProjectPackFromHandle = async (handle: FileSystemDirectoryHandle, mode: ScanMode, displayName = handle.name, lastFilePath?: string) => {
    setWorkspaceMode('projects');
    setIsProjectPackLoading(true);
    setProjectPackFeedback(null);
    const files = await collectProjectFiles(handle, mode);
    setProjectPackName(displayName);
    setProjectPackDirectoryHandle(handle);
    setProjectPackMode(mode);
    setProjectPackFiles(files);
    const rememberedIndex = lastFilePath ? files.findIndex(file => file.path === lastFilePath) : -1;
    setProjectPackIndex(rememberedIndex !== -1 ? rememberedIndex : files.length > 0 ? 0 : -1);
    setStagedModFiles([]);
    setStagedModIndex(-1);
    setStagedUndoSnapshot(null);
    setShowAddModPanel(false);
    setProjectPackFeedback(t('project_files_loaded', files.length));
  };

  const handleLoadProjectPack = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      await loadProjectPackFromHandle(handle, projectPackMode);
    } catch {
      setProjectPackFeedback(t('folder_selected_cancelled'));
    } finally {
      setIsProjectPackLoading(false);
    }
  };

  const handleOpenSavedProject = async (projectId: string) => {
    setShowSavedProjectMenu(false);
    setSavedProjectId(projectId);
    const savedProject = savedProjects.find(project => project.id === projectId);
    if (!savedProject) return;

    try {
      const hasPermission = await ensureDirectoryPermission(savedProject.handle);
      if (!hasPermission) {
        setProjectPackFeedback(t('project_permission_denied'));
        return;
      }
      await loadProjectPackFromHandle(savedProject.handle, savedProject.mode, savedProject.name, savedProject.lastFilePath);
      if (savedProject.targetLang) setTargetLang(savedProject.targetLang);
      if (savedProject.projectSearch) setProjectPackSearch(savedProject.projectSearch);
      setSavedProjectId('');
      addProjectHistory(t('history_project_opened'), savedProject.name);
    } catch {
      setProjectPackFeedback(t('could_not_open_saved_project'));
    } finally {
      setIsProjectPackLoading(false);
    }
  };

  const handleSaveProjectShortcut = async () => {
    if (!projectPackDirectoryHandle || !projectPackName) {
      setProjectPackFeedback(t('no_project_to_save'));
      return;
    }

    try {
      const existingProject = savedProjects.find(project => project.name === projectPackName);
      const savedProject: SavedProjectHandle = {
        id: existingProject?.id || crypto.randomUUID(),
        name: projectPackName,
        mode: projectPackMode,
        targetLang,
        lastFilePath: selectedProjectFile?.path,
        projectSearch: projectPackSearch,
        handle: projectPackDirectoryHandle,
        savedAt: Date.now()
      };
      await saveProjectHandle(savedProject);
      const nextProjects = [
        savedProject,
        ...savedProjects.filter(project => project.id !== savedProject.id)
      ].sort((a, b) => b.savedAt - a.savedAt);
      setSavedProjects(nextProjects);
      setProjectPackFeedback(t('project_shortcut_saved', projectPackName));
      addProjectHistory(t('history_project_saved'), projectPackName);
    } catch {
      setProjectPackFeedback(t('could_not_save_project_shortcut'));
    }
  };

  const handleProjectModeChange = (newMode: ScanMode) => {
    if (newMode === projectPackMode) return;
    setProjectPackMode(newMode);
    setProjectPackFiles(prev => prev.map(file => {
      const convertedWorking = convertTranslationDocument(file.workingContent, file.name, newMode);
      const convertedOriginal = convertTranslationDocument(file.content, file.name, newMode);
      return {
        ...file,
        name: convertedWorking.name,
        path: replaceFileNameInPath(file.path, convertedWorking.name),
        content: convertedOriginal.content,
        workingContent: convertedWorking.content,
        ...analyzeTranslationContent(convertedWorking.content, convertedWorking.name)
      };
    }));
    setStagedModFiles(prev => buildStagedModFiles(prev.map(file => {
      const converted = convertTranslationDocument(file.workingContent, file.name, newMode);
      return {
        name: converted.name,
        workingContent: converted.content
      };
    })));
    setStagedUndoSnapshot(null);
    setProjectPackFeedback(t('format_changed_memory'));
  };

  const handleModeChange = (newMode: ScanMode) => {
    if (newMode !== scanMode && project.files.length > 0) {
      convertFiles(newMode);
    }
    setScanMode(newMode);
  };

  const handleTranslate = async (engine: TranslationEngine, normalize: boolean) => {
    if (!currentFile) return;
    setShowTranslateModal(false);
    const newContent = await translateFile(currentFile.workingContent, targetLang, engine, normalize);
    if (newContent) updateCurrentFile(newContent);
  };

  const handleExportLocal = async () => {
    if (project.files.length === 0) return;
    const files = project.files.map(f => ({ name: f.name, content: f.workingContent }));
    const blob = await exportLocal(files, targetLang);
    downloadBlob(blob, `PZ_Translation_${getPzLanguageSuffix(targetLang)}.zip`);
    setShowExportModal(false);
  };

  const handleExportWorkshop = async (options: ExportOptions) => {
    if (project.files.length === 0) return;
    const files = project.files.map(f => ({ name: f.name, content: f.workingContent }));
    const blob = await exportWorkshop(files, targetLang, options);
    downloadBlob(blob, `${options.folderName}_Workshop.zip`);
    setShowExportModal(false);
  };

  const handleWorkshopScan = async (handles: FileSystemDirectoryHandle[]) => {
    setWorkspaceMode('translator');
    setShowWorkshopModal(false);
    setMultiScanProgress({ current: 0, total: handles.length, currentMod: '' });
    try {
      const files = await performMultiScan(handles, targetLang, scanMode, (p) => setMultiScanProgress(p));
      setProjectFiles(files);
    } catch (error) {
      console.error('Error en escaneo múltiple:', error);
      alert(t('scan_selected_error'));
    } finally {
      setMultiScanProgress(null);
    }
  };

  const handleEditorScroll = (scrollInfo: { top: number }) => {
    if (leftNumbersRef.current) {
      leftNumbersRef.current.scrollTop = scrollInfo.top;
    }
  };

  const updateProjectFile = (content: string) => {
    setProjectPackFiles(prev => {
      if (projectPackIndex === -1) return prev;
      const next = [...prev];
      const analysis = analyzeTranslationContent(content, next[projectPackIndex].name);
      next[projectPackIndex] = {
        ...next[projectPackIndex],
        workingContent: content,
        ...analysis
      };
      return next;
    });
  };

  const buildStagedModFiles = (files: Array<{ name: string; workingContent: string }>): StagedModFile[] => {
    return files.map(file => {
      const modEntries = parseTranslationContent(file.workingContent, file.name);
      const newKeys: string[] = [];
      const duplicateKeys: Array<{ key: string; files: string[] }> = [];

      for (const key of Object.keys(modEntries).sort()) {
        const locations = projectKeyLocations.get(key);
        if (locations && locations.length > 0) duplicateKeys.push({ key, files: locations });
        else newKeys.push(key);
      }

      return {
        name: file.name,
        workingContent: file.workingContent,
        newKeys,
        mergedKeys: 'mergedKeys' in file ? [...((file as StagedModFile).mergedKeys || [])] : [],
        duplicateKeys
      };
    }).filter(file => file.newKeys.length > 0 || file.duplicateKeys.length > 0);
  };

  const rememberStagedState = () => {
    setStagedUndoSnapshot(stagedModFiles.map(file => ({
      ...file,
      newKeys: [...file.newKeys],
      mergedKeys: [...file.mergedKeys],
      duplicateKeys: file.duplicateKeys.map(duplicate => ({ ...duplicate, files: [...duplicate.files] }))
    })));
  };

  const updateStagedKeyValue = (key: string, value: string) => {
    if (!selectedStagedModFile || stagedModIndex === -1) return;

    rememberStagedState();
    const entries = parseTranslationContent(selectedStagedModFile.workingContent, selectedStagedModFile.name);
    entries[key] = value;
    const workingContent = stringifyTranslationContent(entries, selectedStagedModFile.name);
    const rebuilt = buildStagedModFiles([{ name: selectedStagedModFile.name, workingContent }])[0];

    setStagedModFiles(prev => {
      const next = [...prev];
      next[stagedModIndex] = rebuilt || {
        ...selectedStagedModFile,
        workingContent,
        newKeys: [],
        mergedKeys: selectedStagedModFile.mergedKeys,
        duplicateKeys: []
      };
      return next;
    });
  };

  const removeStagedKey = (key: string) => {
    if (!selectedStagedModFile || stagedModIndex === -1) return;

    rememberStagedState();
    const entries = parseTranslationContent(selectedStagedModFile.workingContent, selectedStagedModFile.name);
    delete entries[key];
    const workingContent = stringifyTranslationContent(entries, selectedStagedModFile.name);
    const rebuilt = buildStagedModFiles([{ name: selectedStagedModFile.name, workingContent }])[0];

    setStagedModFiles(prev => {
      const next = [...prev];
      if (!rebuilt) {
        next.splice(stagedModIndex, 1);
        setStagedModIndex(Math.max(0, Math.min(stagedModIndex, next.length - 1)));
        return next;
      }
      next[stagedModIndex] = rebuilt;
      return next;
    });
  };

  const removeAllStagedDuplicates = () => {
    if (stagedModFiles.every(file => file.duplicateKeys.length === 0)) return;

    const undo = captureProjectSnapshot(t('history_duplicates_removed'));
    rememberStagedState();
    const rebuilt = stagedModFiles
      .map(file => {
        const entries = parseTranslationContent(file.workingContent, file.name);
        for (const duplicate of file.duplicateKeys) delete entries[duplicate.key];
        return { name: file.name, workingContent: stringifyTranslationContent(entries, file.name) };
      })
      .flatMap(file => buildStagedModFiles([file]));

    setStagedModFiles(rebuilt);
    setStagedModIndex(rebuilt.length > 0 ? Math.min(stagedModIndex, rebuilt.length - 1) : -1);
    setProjectPackFeedback(t('duplicates_removed'));
    addProjectHistory(t('history_duplicates_removed'), t('duplicate_count', stagedTotals.duplicates), undo);
  };

  const restoreStagedSnapshot = () => {
    if (!stagedUndoSnapshot) return;
    setStagedModFiles(stagedUndoSnapshot);
    setStagedModIndex(stagedUndoSnapshot.length > 0 ? Math.min(stagedModIndex, stagedUndoSnapshot.length - 1) : -1);
    setStagedUndoSnapshot(null);
    setProjectPackFeedback(t('staged_restored'));
  };

  const handleScanProjectMod = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setIsScanningProjectMod(true);
      setProjectPackFeedback(null);
      const result = projectPackMode === '42.15+'
        ? await scanModFolderModern(handle, targetLang)
        : await scanModFolder(handle, targetLang);
      const staged = buildStagedModFiles(result.files.map(file => {
        const converted = convertTranslationDocument(file.workingContent, file.name, projectPackMode);
        return { name: converted.name, workingContent: converted.content };
      }));
      setStagedModName(handle.name);
      setStagedModFiles(staged);
      setStagedModIndex(staged.length > 0 ? 0 : -1);
      setStagedUndoSnapshot(null);
      setProjectPackFeedback(t('project_docs_detected', staged.length, handle.name));
      addProjectHistory(t('history_mod_scanned'), `${handle.name} · ${staged.length} ${t('documents')}`);
    } catch (error) {
      setProjectPackFeedback(
        isDirectoryPickerCancel(error)
          ? t('project_scan_cancelled')
          : t('project_scan_failed', getErrorMessage(error))
      );
    } finally {
      setIsScanningProjectMod(false);
    }
  };

  const translateStagedMod = async () => {
    if (stagedModFiles.length === 0) return;
    setIsTranslatingProjectMod(true);
    try {
      const translated = [];
      for (const file of stagedModFiles) {
        const newContent = await translateFile(file.workingContent, targetLang, 'google', true);
        const converted = convertTranslationDocument(newContent || file.workingContent, file.name, projectPackMode);
        translated.push({
          ...file,
          name: converted.name,
          workingContent: converted.content
        });
      }
      setStagedModFiles(buildStagedModFiles(translated));
      setStagedUndoSnapshot(null);
      setProjectPackFeedback(t('project_mod_translated'));
      addProjectHistory(t('history_mod_translated'), stagedModName || t('added_mod'));
    } finally {
      setIsTranslatingProjectMod(false);
    }
  };

  const getNewProjectTranslationFile = (stagedName: string) => {
    const typeName = getTranslationTypeName(stagedName);
    const extension = projectPackMode === '42.15+' ? '.json' : '.txt';
    const languageSuffix = getPzLanguageSuffix(targetLang);
    const sameExtensionFiles = projectPackFiles.filter(file => file.name.toLowerCase().endsWith(extension));
    const templateFile = sameExtensionFiles.find(file => splitTranslationFileName(file.name).languageSuffix === languageSuffix)
      || sameExtensionFiles[0]
      || null;
    const usesLanguageSuffix = templateFile
      ? splitTranslationFileName(templateFile.name).languageSuffix !== null
      : splitTranslationFileName(stagedName).languageSuffix !== null;
    const name = usesLanguageSuffix ? `${typeName}_${languageSuffix}${extension}` : `${typeName}${extension}`;
    return {
      name,
      path: templateFile ? replaceFileNameInPath(templateFile.path, name) : name
    };
  };

  const mergeStagedFile = (file: StagedModFile) => {
    const targetType = getTranslationTypeName(file.name);
    const targetIndex = projectPackFiles.findIndex(item => getTranslationTypeName(item.name) === targetType);
    const sourceEntries = parseTranslationContent(file.workingContent, file.name);
    const entriesToAdd = Object.fromEntries(file.newKeys.map(key => [key, sourceEntries[key] || '']));

    if (Object.keys(entriesToAdd).length === 0) {
      setProjectPackFeedback(t('no_new_keys_document'));
      return;
    }

    if (targetIndex === -1) {
      const undo = captureProjectSnapshot(t('history_keys_merged'));
      const projectFile = getNewProjectTranslationFile(file.name);
      const content = stringifyTranslationContent(entriesToAdd, projectFile.name);
      const analysis = analyzeTranslationContent(content, projectFile.name);
      setProjectPackFiles(prev => [...prev, {
        name: projectFile.name,
        path: projectFile.path,
        handle: null,
        content: '',
        workingContent: content,
        ...analysis
      }]);
      setProjectPackFeedback(t('prepared_new_document', projectFile.name));
      addProjectHistory(t('history_keys_merged'), t('prepared_new_document', projectFile.name), undo);
      setStagedModFiles(prev => prev.map(item => item.name === file.name
        ? { ...item, mergedKeys: [...new Set([...item.mergedKeys, ...item.newKeys])], newKeys: [] }
        : item
      ));
      return;
    }

    const undo = captureProjectSnapshot(t('history_keys_merged'));
    const targetFile = projectPackFiles[targetIndex];
    const targetEntries = parseTranslationContent(targetFile.workingContent, targetFile.name);
    const content = stringifyTranslationContent({ ...targetEntries, ...entriesToAdd }, targetFile.name);
    setProjectPackFiles(prev => {
      const next = [...prev];
      next[targetIndex] = {
        ...next[targetIndex],
        workingContent: content,
        ...analyzeTranslationContent(content, next[targetIndex].name)
      };
      return next;
    });
    setProjectPackIndex(targetIndex);
    setProjectPackFeedback(t('keys_added_to_file', file.newKeys.length, targetFile.name));
    addProjectHistory(t('history_keys_merged'), t('keys_added_to_file', file.newKeys.length, targetFile.name), undo);
    setStagedModFiles(prev => prev.map(item => item.name === file.name
      ? { ...item, mergedKeys: [...new Set([...item.mergedKeys, ...item.newKeys])], newKeys: [] }
      : item
    ));
  };

  const resolveStagedDuplicate = (key: string, action: 'keep' | 'use_new' | 'remove') => {
    if (!selectedStagedModFile || stagedModIndex === -1) return;
    const targetType = getTranslationTypeName(selectedStagedModFile.name);
    const targetIndex = projectPackFiles.findIndex(item => getTranslationTypeName(item.name) === targetType);
    const sourceEntries = parseTranslationContent(selectedStagedModFile.workingContent, selectedStagedModFile.name);
    const undo = captureProjectSnapshot(t('history_duplicate_resolved'));

    if (action === 'use_new' && targetIndex !== -1) {
      const targetFile = projectPackFiles[targetIndex];
      const targetEntries = parseTranslationContent(targetFile.workingContent, targetFile.name);
      targetEntries[key] = sourceEntries[key] || '';
      const content = stringifyTranslationContent(targetEntries, targetFile.name);
      setProjectPackFiles(prev => {
        const next = [...prev];
        next[targetIndex] = {
          ...next[targetIndex],
          workingContent: content,
          ...analyzeTranslationContent(content, next[targetIndex].name)
        };
        return next;
      });
      setProjectPackIndex(targetIndex);
    }

    if (action === 'keep' || action === 'use_new' || action === 'remove') {
      removeStagedKey(key);
      setProjectPackFeedback(t(action === 'use_new' ? 'duplicate_used_new' : action === 'keep' ? 'duplicate_kept_current' : 'duplicate_removed_one'));
      addProjectHistory(t('history_duplicate_resolved'), key, undo);
    }
  };

  const jumpToDuplicate = (duplicate: { key: string; files: string[] }) => {
    const targetIndex = projectPackFiles.findIndex(file => file.path === duplicate.files[0]);
    if (targetIndex !== -1) setProjectPackIndex(targetIndex);
    setPreviewDuplicateKey(duplicate.key);
  };

  const jumpToFirstDuplicate = () => {
    const stagedDuplicateIndex = stagedModFiles.findIndex(file => file.duplicateKeys.length > 0);
    if (showAddModPanel && stagedDuplicateIndex !== -1) {
      setStagedModIndex(stagedDuplicateIndex);
      setStagedChangeFilter('duplicate');
      const duplicate = stagedModFiles[stagedDuplicateIndex].duplicateKeys[0];
      if (duplicate) {
        const targetIndex = projectPackFiles.findIndex(file => file.path === duplicate.files[0]);
        if (targetIndex !== -1) setProjectPackIndex(targetIndex);
        setPreviewDuplicateKey(duplicate.key);
      }
      setProjectPackFeedback(t('selected_duplicate'));
      return;
    }

    if (projectConflicts.length > 0) {
      jumpToDuplicate(projectConflicts[0]);
      setShowAddModPanel(false);
    }
  };

  const jumpToFirstNewKey = () => {
    if (!showAddModPanel) return;
    const stagedNewIndex = stagedModFiles.findIndex(file => file.newKeys.length > 0);
    if (stagedNewIndex === -1) return;
    setStagedModIndex(stagedNewIndex);
    setStagedChangeFilter('new');
    setPreviewDuplicateKey(null);
    setProjectPackFeedback(t('filter_new'));
  };

  const handleStagedFilterChange = (filter: ChangeFilter) => {
    setStagedChangeFilter(filter);
    if (filter !== 'duplicate') setPreviewDuplicateKey(null);
  };

  const getActiveAIFile = () => {
    if (showProjectWorkspace && selectedProjectFile) {
      return {
        name: selectedProjectFile.name,
        content: selectedProjectFile.workingContent,
        apply: (content: string) => updateProjectFile(content)
      };
    }
    if (currentFile) {
      return {
        name: currentFile.name,
        content: currentFile.workingContent,
        apply: (content: string) => updateCurrentFile(content)
      };
    }
    return null;
  };

  const handleSelectAIIssue = (key: string) => {
    if (showProjectWorkspace) {
      setProjectGlobalSearch(key);
      setPreviewDuplicateKey(key);
      setShowAIModal(false);
      return;
    }
    setSearchTerm(key);
    setShowAIModal(false);
  };

  const handleToggleAddModPanel = () => {
    const next = !showAddModPanel;
    setShowAddModPanel(next);
    setPreviewDuplicateKey(null);
    if (!next) setStagedChangeFilter('all');
  };

  const createProjectBackup = async (file: ProjectJsonFile) => {
    if (!projectPackDirectoryHandle) return;
    if (!file.handle) return;
    try {
      const backupHandle = await getFileHandleByPath(projectPackDirectoryHandle, `${file.path}.bak`, true);
      const writable = await backupHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
    } catch {
      setProjectPackFeedback(t('backup_failed', file.name));
    }
  };

  const triggerSavePulse = () => {
    setSavePulse(true);
    window.setTimeout(() => setSavePulse(false), 900);
  };

  const exportProjectReport = () => {
    const report = {
      project: projectPackName || t('no_project'),
      format: projectPackMode === '42.15+' ? 'JSON' : 'TXT',
      targetLanguage: targetLang,
      generatedAt: new Date().toISOString(),
      files: projectPackFiles.map(file => ({
        name: file.name,
        path: file.path,
        keys: file.keyCount,
        pending: file.workingContent !== file.content,
        duplicates: file.duplicateKeys,
        empty: findEmptyTranslationEntries(file.workingContent, file.name),
        error: file.parseError || null
      })),
      crossFileDuplicates: projectConflicts,
      stagedMod: {
        name: stagedModName,
        files: stagedModFiles.map(file => ({
          name: file.name,
          newKeys: file.newKeys,
          duplicateKeys: file.duplicateKeys,
          mergedKeys: file.mergedKeys
        }))
      },
      validation: projectValidationIssues
    };
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${projectPackName || 'Kasual_Project'}_report.json`);
    setProjectPackFeedback(t('report_exported'));
    addProjectHistory(t('history_report_exported'), projectPackName || t('project'));
  };

  const saveProjectFile = async () => {
    if (!selectedProjectFile) return;
    try {
      const validationError = validateTranslationContent(selectedProjectFile.workingContent, selectedProjectFile.name);
      if (validationError) {
        setProjectPackFeedback(t('invalid_json', validationError));
        return;
      }
      const namingError = validatePzFileName(selectedProjectFile.name, projectPackMode, targetLang);
      if (namingError && !window.confirm(t('save_with_warnings', namingError))) return;
      const undo = captureProjectSnapshot(t('history_file_saved'));
      let fileHandle = selectedProjectFile.handle;
      if (!fileHandle) {
        if (!projectPackDirectoryHandle) {
          setProjectPackFeedback(t('prepared_no_physical_file'));
          return;
        }
        fileHandle = await getFileHandleByPath(projectPackDirectoryHandle, selectedProjectFile.path, true);
      }
      await createProjectBackup(selectedProjectFile);
      const writable = await fileHandle.createWritable();
      await writable.write(selectedProjectFile.workingContent);
      await writable.close();
      setProjectPackFiles(prev => {
        const next = [...prev];
        next[projectPackIndex] = {
          ...next[projectPackIndex],
          handle: fileHandle,
          content: next[projectPackIndex].workingContent
        };
        return next;
      });
      setProjectPackFeedback(t('saved_current_file', selectedProjectFile.name));
      triggerSavePulse();
      addProjectHistory(t('history_file_saved'), selectedProjectFile.name, undo);
    } catch {
      setProjectPackFeedback(t('could_not_save_file'));
    }
  };

  const saveAllProjectFiles = async () => {
    const dirtyFiles = projectPackFiles.filter(file => file.workingContent !== file.content);
    const invalidFile = dirtyFiles.find(file => validateTranslationContent(file.workingContent, file.name));
    if (invalidFile) {
      setProjectPackFeedback(t('invalid_json', `${invalidFile.name}: ${validateTranslationContent(invalidFile.workingContent, invalidFile.name)}`));
      return;
    }
    const warningFile = dirtyFiles.find(file => validatePzFileName(file.name, projectPackMode, targetLang));
    if (warningFile && !window.confirm(t('save_with_warnings', `${warningFile.name}: ${validatePzFileName(warningFile.name, projectPackMode, targetLang)}`))) return;

    const writableFiles = dirtyFiles.filter(file => file.handle || projectPackDirectoryHandle);
    if (writableFiles.length === 0) {
      setProjectPackFeedback(t('no_project_changes'));
      return;
    }

    const summary = t('save_all_summary', writableFiles.length, stagedTotals.newKeys, stagedTotals.duplicates);
    if (!window.confirm(summary)) return;

    try {
      const undo = captureProjectSnapshot(t('history_all_saved'));
      const savedHandles = new Map<string, FileSystemFileHandle>();
      for (const file of writableFiles) {
        await createProjectBackup(file);
        const fileHandle = file.handle || await getFileHandleByPath(projectPackDirectoryHandle!, file.path, true);
        const writable = await fileHandle.createWritable();
        await writable.write(file.workingContent);
        await writable.close();
        savedHandles.set(file.path, fileHandle);
      }
      setProjectPackFiles(prev => prev.map(file => (
        savedHandles.has(file.path)
          ? { ...file, handle: savedHandles.get(file.path) || file.handle, content: file.workingContent, ...analyzeTranslationContent(file.workingContent, file.name) }
          : file
      )));
      setProjectPackFeedback(t('saved_all_files', writableFiles.length));
      triggerSavePulse();
      addProjectHistory(t('history_all_saved'), t('saved_all_files', writableFiles.length), undo);
    } catch {
      setProjectPackFeedback(t('could_not_save_file'));
    }
  };

  const addProjectExtra = () => {
    if (!selectedProjectFile || !extraKey.trim()) return;

    try {
      const data = parseTranslationContent(selectedProjectFile.workingContent, selectedProjectFile.name);

      if (Object.prototype.hasOwnProperty.call(data, extraKey.trim())) {
        setProjectPackFeedback(t('key_exists_file'));
        return;
      }

      const nextData = {
        ...data,
        [extraKey.trim()]: extraValue
      };
      const undo = captureProjectSnapshot(t('key_added_file'));
      updateProjectFile(stringifyTranslationContent(nextData, selectedProjectFile.name));
      setExtraKey('');
      setExtraValue('');
      setProjectPackFeedback(t('key_added_file'));
      addProjectHistory(t('key_added_file'), extraKey.trim(), undo);
    } catch {
      setProjectPackFeedback(t('cannot_add_invalid_format'));
    }
  };

  const activeAIFile = getActiveAIFile();
  const isOperationActive = isScanning
    || isTranslating
    || !!multiScanProgress
    || isProjectPackLoading
    || isScanningProjectMod
    || isTranslatingProjectMod
    || savePulse;

  return (
    <div className={`app ${showStartScreen ? 'is-start-screen' : ''} ${showProjectWorkspace ? 'is-project-workspace' : ''} ${!showStartScreen && !showProjectWorkspace ? 'is-translator-workspace' : ''} ${isOperationActive ? 'is-operation-active' : ''}`}>
      <div className="boot-sequence" aria-hidden="true">
        <div className="boot-core">
          <img src={kasualMascotLogo} alt="" />
          <span />
          <span />
          <span />
        </div>
      </div>
      {appToasts.length > 0 && (
        <div className="app-toast-stack" role="status" aria-live="polite">
          {appToasts.map(toast => (
            <div className={`app-toast is-${toast.source}`} key={toast.id}>
              <FaCheck aria-hidden="true" />
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
      <div className="device-ornaments" aria-hidden="true">
        <div className="status-cluster">
          <span className="status-led is-on" />
          <span className="status-led" />
          <span className="status-led" />
        </div>
        <div className="case-scar case-scar-a" />
        <div className="case-scar case-scar-b" />
      </div>
      {!showStartScreen && (
        <header className="app-header">
          <div className="brand">
            <img src={kasualLogo} alt="Kasual Translate" className={`brand-logo ${showProjectWorkspace ? 'logo-variant-project' : 'logo-variant-translator'}`} />
            <div className="brand-copy">
              <h1>Kasual Translate</h1>
              <span className="version">v2.0</span>
              {showProjectWorkspace && <span className="header-context">{t('project_manager')}</span>}
            </div>
          </div>
          <div className="header-actions">
            <ThemeToggle label={t('theme')} />
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="lang-select" disabled={isTranslating || !!multiScanProgress}>
              {TARGET_LANGUAGES.map(language => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
            <button onClick={() => setShowHelpModal(true)} className="btn icon-only" title={t('help')} aria-label={t('help')}>
              <FaQuestionCircle aria-hidden="true" />
            </button>
            <button onClick={() => setShowAIModal(true)} className="btn icon-only ai-header-btn" title={t('ai_assistant')} aria-label={t('ai_assistant')}>
              <FaRobot aria-hidden="true" />
            </button>
          </div>
        </header>
      )}

      <ProgressBar
        visible={!!multiScanProgress || isScanning || isTranslating}
        progress={multiScanProgress ? (multiScanProgress.current / multiScanProgress.total) * 100 : undefined}
        text={multiScanProgress ? `${t('progress_scanning_mods')} ${multiScanProgress.current}/${multiScanProgress.total} (${multiScanProgress.currentMod})` : (isScanning ? t('progress_scanning') : (isTranslating ? `${t('status_translating', progress.current, progress.total)}...` : ''))}
        onAbort={() => {}}
        abortText={t('abort').replace('⛔ ', '')}
      />

      <div className="main-layout">
        {!isStandaloneScreen && (
          <div className="left-sidebar">
          <div className="project-info">
            <h3>{t('project')}</h3>
            {currentDirectoryHandle ? (
              <div className="project-details">
                <div className="project-name" title={currentDirectoryHandle.name}>
                  <FaFolderOpen aria-hidden="true" /> {currentDirectoryHandle.name}
                </div>
                <div className="project-stats">
                  <span><FaFileAlt aria-hidden="true" /> {project.files.length} {t('files')}</span>
                  <span><FaKey aria-hidden="true" /> {totalKeys} {t('strings')}</span>
                </div>
              </div>
            ) : (
              <div className="no-project">{t('no_project_loaded')}</div>
            )}
          </div>

          <div className="format-controls">
            <h4>{t('mod_format')}</h4>
            <div className="mode-selector">
              <button
                className={`mode-btn ${scanMode === '42' ? 'active' : ''}`}
                onClick={() => handleModeChange('42')}
                disabled={isScanning || isTranslating || !!multiScanProgress}
              >
                {t('format_42_txt')}
              </button>
              <button
                className={`mode-btn ${scanMode === '42.15+' ? 'active' : ''}`}
                onClick={() => handleModeChange('42.15+')}
                disabled={isScanning || isTranslating || !!multiScanProgress}
              >
                {t('format_4215_json')}
              </button>
            </div>
            <p className="mode-description">
              {scanMode === '42' 
                ? t('format_legacy_desc')
                : t('format_modern_desc')}
            </p>
          </div>

          <div className="file-controls">
            <div className="search-box">
              <FaSearch className="search-icon" aria-hidden="true" />
              <input
                type="text"
                placeholder={t('search_files')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="sort-bar">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'status')} className="sort-select" title={t('sort_by')}>
                <option value="name">{t('sort_name')}</option>
                <option value="status">{t('sort_status_short')}</option>
              </select>
            </div>
          </div>

          <FileList
            files={project.files}
            currentFile={project.currFile}
            onSelectFile={selectFile}
            searchTerm={searchTerm}
            sortBy={sortBy}
            t={t}
          />
          </div>
        )}

        <div className={`editor-area ${showStartScreen ? 'is-empty-dashboard' : ''}`}>
          {!isStandaloneScreen && (
            <div className="editor-toolbar">
              <div className="toolbar-left">
                <button onClick={handleLoadFolder} className="btn primary" disabled={isScanning || isTranslating || !!multiScanProgress}>
                  <FaFolderOpen aria-hidden="true" /> {isScanning ? t('scanning') : t('scan').replace('📂 ', '')}
                </button>
                <button onClick={() => setShowWorkshopModal(true)} className="btn" disabled={!!multiScanProgress}>
                  <FaHammer aria-hidden="true" /> {t('workshop')}
                </button>
                <button onClick={() => setShowExportModal(true)} className="btn" disabled={project.files.length === 0 || !!multiScanProgress}>
                  <FaBoxOpen aria-hidden="true" /> {t('exporting')}
                </button>
                <button onClick={() => setShowExtrasModal(true)} className="btn">
                  <FaCogs aria-hidden="true" /> {t('extras').replace('⚙️ ', '')}
                </button>
                <button onClick={() => setShowAIModal(true)} className="btn btn-tool">
                  <FaRobot aria-hidden="true" /> {t('ai_short')}
                </button>
              </div>
              {currentFile && (
                <div className="toolbar-right">
                  <DiffNavigation onPrev={handleNextDiff} onNext={handleNextDiff} disabled={!currentFile} prevTitle={t('diff_prev')} nextTitle={t('diff_next')} />
                  <button onClick={() => setShowTranslateModal(true)} className="btn" disabled={!currentFile || isTranslating || !!multiScanProgress}>
                    <FaBolt aria-hidden="true" /> {t('translate').replace('⚡ ', '')}
                  </button>
                  <button onClick={() => setShowPreviewModal(true)} className="btn" disabled={!currentFile}>
                    <FaEye aria-hidden="true" /> {t('preview_button')}
                  </button>
                  {saveFeedback && <span className="save-feedback">{saveFeedback}</span>}
                  <button
                    onClick={handleSaveCurrentFile}
                    className={`btn primary save-btn ${hasUnsavedChanges ? 'is-dirty' : 'is-saved'}`}
                    disabled={isTranslating}
                    title={t('save')}
                  >
                    {hasUnsavedChanges ? <FaSave aria-hidden="true" /> : <FaCheck aria-hidden="true" />}
                    {hasUnsavedChanges ? t('save') : t('saved_state')}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isScanning && !multiScanProgress && scanErrors.length > 0 && (
            <div className="scan-errors">
              <h4>{t('scan_errors_title', scanErrors.length)}</h4>
              <ul>
                {scanErrors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          {showStartScreen && (
            <section className="empty-dashboard" aria-label={t('start_title')}>
              <div className="empty-panel-tools">
                <ThemeToggle label={t('theme')} />
              </div>
              <div className="empty-dashboard-main">
                <div className="empty-logo-shell logo-shell-command">
                  <img src={kasualTerminalLogo} alt="" className="empty-logo logo-variant-command" />
                </div>
                <div className="empty-copy">
                  <span className="empty-kicker">Kasual Translate V2</span>
                  <h2>{t('start_title')}</h2>
                  <div className="empty-status-line">
                    <span className="empty-led" />
                    <span>{statusText}</span>
                  </div>
                </div>
              </div>

              <div className="empty-actions">
                <button onClick={handleLoadFolder} className="btn primary empty-action" disabled={isScanning || isTranslating || !!multiScanProgress}>
                  <FaFolderOpen aria-hidden="true" /> {t('scan').replace('📂 ', '')}
                </button>
                <button onClick={() => setShowWorkshopModal(true)} className="btn empty-action" disabled={!!multiScanProgress}>
                  <FaHammer aria-hidden="true" /> {t('workshop')}
                </button>
                <button onClick={() => setWorkspaceMode('projects')} className="btn empty-action">
                  <FaLayerGroup aria-hidden="true" /> {t('projects')}
                </button>
              </div>

              {savedProjects.length > 0 && (
                <div className="start-recent-projects" aria-label={t('recent_projects')}>
                  <div className="start-recent-title">
                    <FaHistory aria-hidden="true" />
                    <span>{t('recent_projects')}</span>
                  </div>
                  <div className="start-recent-list">
                    {savedProjects.slice(0, 3).map(savedProject => (
                      <button
                        key={savedProject.id}
                        className="recent-project-card"
                        onClick={() => handleOpenSavedProject(savedProject.id)}
                        disabled={isProjectPackLoading}
                      >
                        <FaDatabase aria-hidden="true" />
                        <strong>{savedProject.name}</strong>
                        <span>{savedProject.mode === '42.15+' ? 'JSON' : 'TXT'} · {getLanguageLabel(savedProject.targetLang || targetLang)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="empty-grid">
                <label className="empty-cell empty-cell-control">
                  <span>{t('format')}</span>
                  <div className="empty-select-wrap">
                    <select
                      value={scanMode}
                      onChange={(e) => handleModeChange(e.target.value as ScanMode)}
                      className="empty-select"
                      disabled={isScanning || isTranslating || !!multiScanProgress}
                    >
                      <option value="42">{t('format_42_txt')}</option>
                      <option value="42.15+">{t('format_4215_json')}</option>
                    </select>
                  </div>
                </label>
                <label className="empty-cell empty-cell-control">
                  <span>{t('destination')}</span>
                  <div className="empty-select-wrap">
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="empty-select"
                      disabled={isTranslating || !!multiScanProgress}
                    >
                      {TARGET_LANGUAGES.map(language => (
                        <option key={language.code} value={language.code}>{language.label}</option>
                      ))}
                    </select>
                  </div>
                </label>
                <div className="empty-cell">
                  <span>{t('files_title').replace('📄 ', '')}</span>
                  <strong>{project.files.length}</strong>
                </div>
                <div className="empty-cell">
                  <span>{t('state')}</span>
                  <strong>{statusText}</strong>
                </div>
              </div>
            </section>
          )}

          {showProjectWorkspace && (
            <section className="project-workspace" aria-label={t('project_manager')}>
              <div className="project-workspace-header">
                <div className="project-workspace-title">
                  <div className="empty-logo-shell compact logo-shell-project">
                    <img src={kasualProjectLogo} alt="" className="empty-logo logo-variant-project" />
                  </div>
                  <div>
                    <span className="empty-kicker">Kasual Translate V2</span>
                    <h2>{t('project_manager')}</h2>
                  </div>
                </div>
                <div className="project-workspace-actions">
                  <button onClick={() => setWorkspaceMode(null)} className="btn btn-tool">
                    {t('back')}
                  </button>
                  <select
                    value={projectPackMode}
                    onChange={(e) => handleProjectModeChange(e.target.value as ScanMode)}
                    className="project-mode-select"
                  >
                    <option value="42.15+">{t('format_4215_json_short')}</option>
                    <option value="42">{t('format_42_txt_short')}</option>
                  </select>
                  <button onClick={handleLoadProjectPack} className="btn primary" disabled={isProjectPackLoading}>
                    <FaFolderOpen aria-hidden="true" /> {isProjectPackLoading ? t('loading') : t('select_folder')}
                  </button>
                  <button onClick={handleSaveProjectShortcut} className="btn btn-tool" disabled={!projectPackDirectoryHandle}>
                    <FaSave aria-hidden="true" /> {t('save_project')}
                  </button>
                  <button onClick={saveAllProjectFiles} className="btn primary" disabled={projectSaveSummary.dirtyFiles.length === 0}>
                    <FaSave aria-hidden="true" /> {t('save_all')}
                  </button>
                  <button onClick={() => setShowPendingChanges(prev => !prev)} className="btn btn-tool" disabled={projectSaveSummary.dirtyFiles.length === 0}>
                    <FaFileAlt aria-hidden="true" /> {t('pending_files')}
                  </button>
                  <button onClick={exportProjectReport} className="btn btn-tool" disabled={projectPackFiles.length === 0}>
                    <FaDatabase aria-hidden="true" /> {t('export_report')}
                  </button>
                  <button onClick={() => restoreProjectSnapshot(projectUndoStack[0])} className="btn btn-tool" disabled={projectUndoStack.length === 0}>
                    <FaUndo aria-hidden="true" /> {t('undo_action')}
                  </button>
                  <button onClick={handleToggleAddModPanel} className={`btn add-mod-toggle ${showAddModPanel ? 'closing' : 'adding'}`} disabled={projectPackFiles.length === 0}>
                    <FaPlus aria-hidden="true" /> {showAddModPanel ? t('close_added_mod') : t('add_mod')}
                  </button>
                  <button onClick={() => setShowAIModal(true)} className="btn btn-tool" disabled={!selectedProjectFile}>
                    <FaRobot aria-hidden="true" /> {t('ai_short')}
                  </button>
                </div>
              </div>

              <div className="project-pack-stats">
                <div className="empty-cell project-selector-cell">
                  <span>{t('project')}</span>
                  <div className="project-selector-menu">
                    <button
                      type="button"
                      className="project-selector-trigger"
                      onClick={() => setShowSavedProjectMenu(prev => !prev)}
                      disabled={savedProjects.length === 0 || isProjectPackLoading}
                      aria-haspopup="listbox"
                      aria-expanded={showSavedProjectMenu}
                    >
                      <strong>{projectPackName || (savedProjects.length === 0 ? t('no_project') : t('saved_projects'))}</strong>
                      <span>{projectPackMode === '42.15+' ? 'JSON' : 'TXT'}</span>
                    </button>
                    {showSavedProjectMenu && savedProjects.length > 0 && (
                      <div className="project-selector-popover" role="listbox" aria-label={t('saved_projects')}>
                        {savedProjects.map(project => (
                          <button
                            type="button"
                            key={project.id}
                            className="project-selector-option"
                            onClick={() => handleOpenSavedProject(project.id)}
                            disabled={isProjectPackLoading}
                            role="option"
                            aria-selected={savedProjectId === project.id}
                          >
                            <FaDatabase aria-hidden="true" />
                            <span>
                              <strong>{project.name}</strong>
                              <small>{project.mode === '42.15+' ? 'JSON' : 'TXT'} · {getLanguageLabel(project.targetLang || targetLang)}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="empty-cell">
                  <span>{showAddModPanel ? t('documents') : (projectPackMode === '42.15+' ? 'JSON' : 'TXT')}</span>
                  <strong>{projectBarStats.documents}</strong>
                </div>
                <button
                  type="button"
                  className="empty-cell project-stat-button"
                  onClick={jumpToFirstNewKey}
                  disabled={!showAddModPanel || projectBarStats.newKeys === 0}
                  title={t('filter_new')}
                >
                  <span>{t('new_keys')}</span>
                  <strong>{projectBarStats.newKeys}</strong>
                </button>
                <button
                  type="button"
                  className="empty-cell project-stat-button"
                  onClick={jumpToFirstDuplicate}
                  disabled={projectBarStats.duplicates === 0}
                  title={t('selected_duplicate')}
                >
                  <span>{t('duplicates')}</span>
                  <strong>{projectBarStats.duplicates}</strong>
                </button>
                <div className="empty-cell">
                  <span>{t('errors')}</span>
                  <strong>{projectBarStats.errors}</strong>
                </div>
              </div>

              {projectPackFeedback && <div className="project-feedback">{projectPackFeedback}</div>}
              {savePulse && <div className="save-sweep" aria-hidden="true"><span>{t('writing_disk')}</span></div>}

              {projectPackFiles.length > 0 && (
                <div className={`project-validation-panel ${projectValidationIssues.some(issue => issue.severity === 'error') ? 'has-errors' : projectValidationIssues.length > 0 ? 'has-warnings' : 'is-clean'}`}>
                  <div className="project-validation-title">
                    {projectValidationIssues.some(issue => issue.severity === 'error') ? <FaQuestionCircle aria-hidden="true" /> : <FaCheck aria-hidden="true" />}
                    <div>
                      <strong>{t('validation_panel')}</strong>
                      <span>{projectValidationIssues.length === 0 ? t('validation_all_clear') : t('validation_issue_count', projectValidationIssues.length)}</span>
                    </div>
                  </div>
                  <div className="project-validation-list">
                    {projectValidationIssues.length === 0 ? (
                      <span className="project-validation-clean">{t('validation_ready_to_save')}</span>
                    ) : projectValidationIssues.slice(0, 5).map(issue => (
                      <button
                        key={issue.id}
                        className={`project-validation-item ${issue.severity}`}
                        onClick={() => {
                          if (issue.filePath) {
                            const index = projectPackFiles.findIndex(file => file.path === issue.filePath);
                            if (index !== -1) {
                              setProjectPackIndex(index);
                              setShowAddModPanel(false);
                            }
                          }
                        }}
                      >
                        <span className={`filter-dot ${issue.severity === 'error' ? 'duplicate' : issue.severity === 'warning' ? 'all' : 'new'}`} />
                        <strong>{issue.label}</strong>
                        <span>{issue.detail}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showPendingChanges && projectSaveSummary.dirtyFiles.length > 0 && (
                <div className="pending-changes-panel">
                  {projectSaveSummary.dirtyFiles.map(file => (
                    <button
                      key={file.path}
                      className="pending-change-item"
                      onClick={() => {
                        const index = projectPackFiles.findIndex(item => item.path === file.path);
                        if (index !== -1) {
                          setProjectPackIndex(index);
                          setShowAddModPanel(false);
                          setPreviewDuplicateKey(null);
                        }
                      }}
                    >
                      <span className={`project-file-dot ${file.parseError ? 'error' : 'dirty'}`} />
                      <strong>{getDisplayTranslationFileName(file.name)}</strong>
                      <span>{file.handle ? t('pending') : t('new_document')}</span>
                    </button>
                  ))}
                </div>
              )}

              {showAddModPanel && (
                <div className="project-add-mod-panel">
                  <div className="project-editor-header project-add-mod-header">
                    <div>
                      <span className="empty-kicker">{t('add_content_pack')}</span>
                      <h3>{stagedModName || t('no_mod_scanned')}</h3>
                    </div>
                    <div className="project-workspace-actions">
                      <button onClick={handleScanProjectMod} className="btn primary" disabled={isScanningProjectMod}>
                        <FaSearch aria-hidden="true" /> {isScanningProjectMod ? t('scanning') : t('scan_other_mod')}
                      </button>
                      <button onClick={translateStagedMod} className="btn" disabled={stagedModFiles.length === 0 || isTranslatingProjectMod}>
                        <FaLanguage aria-hidden="true" /> {isTranslatingProjectMod ? t('translating') : t('translate_to', targetLanguageLabel)}
                      </button>
                      <button onClick={removeAllStagedDuplicates} className="btn btn-danger" disabled={stagedTotals.duplicates === 0}>
                        <FaTrash aria-hidden="true" /> {t('remove_duplicates')}
                      </button>
                      <button onClick={restoreStagedSnapshot} className="btn btn-tool" disabled={!stagedUndoSnapshot}>
                        <FaUndo aria-hidden="true" /> {t('redo')}
                      </button>
                    </div>
                  </div>

                  {stagedModFiles.length > 0 && (
                    <div className="project-pack-layout staged-mod-grid">
                      <aside className="project-pack-sidebar staged-mod-list">
                        {stagedModFiles.map((file, index) => (
                          <button
                            key={file.name}
                            className={`project-file-item staged-mod-item ${index === stagedModIndex ? 'active' : ''}`}
                            onClick={() => setStagedModIndex(index)}
                          >
                            <span className={`project-file-dot ${file.duplicateKeys.length > 0 ? 'warn' : 'dirty'}`} />
                            <span className="project-file-name">{getDisplayTranslationFileName(file.name)}</span>
                            <span className="project-file-count">{file.newKeys.length}/{file.duplicateKeys.length}</span>
                          </button>
                        ))}
                      </aside>
                      <div className="project-pack-main staged-mod-detail">
                        {selectedStagedModFile && (
                          <>
                            <div className="staged-mod-detail-header">
                              <div>
                                <strong>{getDisplayTranslationFileName(selectedStagedModFile.name)}</strong>
                                <span>{selectedTargetProjectFile ? t('target_file', getDisplayTranslationFileName(selectedTargetProjectFile.name)) : t('target_new_document')}</span>
                              </div>
                              <div className="staged-filter-bar" aria-label={t('filter_changes')}>
                                <button
                                  type="button"
                                  className={`staged-filter-btn ${stagedChangeFilter === 'all' ? 'active' : ''}`}
                                  onClick={() => handleStagedFilterChange('all')}
                                >
                                  <span className="filter-dot all" aria-hidden="true" />
                                  {t('filter_all')} <strong>{selectedStagedRows.length}</strong>
                                </button>
                                <button
                                  type="button"
                                  className={`staged-filter-btn ${stagedChangeFilter === 'new' ? 'active' : ''}`}
                                  onClick={() => handleStagedFilterChange('new')}
                                  disabled={selectedStagedModFile.newKeys.length === 0}
                                >
                                  <span className="filter-dot new" aria-hidden="true" />
                                  {t('filter_new')} <strong>{selectedStagedModFile.newKeys.length}</strong>
                                </button>
                                <button
                                  type="button"
                                  className={`staged-filter-btn ${stagedChangeFilter === 'duplicate' ? 'active' : ''}`}
                                  onClick={() => handleStagedFilterChange('duplicate')}
                                  disabled={selectedStagedModFile.duplicateKeys.length === 0}
                                >
                                  <span className="filter-dot duplicate" aria-hidden="true" />
                                  {t('filter_duplicates')} <strong>{selectedStagedModFile.duplicateKeys.length}</strong>
                                </button>
                              </div>
                              <button onClick={() => mergeStagedFile(selectedStagedModFile)} className="btn">
                                <FaSave aria-hidden="true" /> {t('save_new')}
                              </button>
                            </div>
                            <div className="staged-original-preview" key={`${selectedStagedModFile.name}-${stagedChangeFilter}`}>
                              <div className="editor-panel project-preview-panel">
                                <div className="panel-header">
                                  <div className="color-selectors">
                                    <div className="color-circle" style={{ backgroundColor: leftIdColor }} onClick={(e) => openPicker(setShowLeftIdPicker, e)} title={t('change_key_color')} />
                                    <div className="color-circle" style={{ backgroundColor: leftTextColor }} onClick={(e) => openPicker(setShowLeftTextPicker, e)} title={t('change_text_color')} />
                                  </div>
                                  <span className="filename">{t('added_mod')}</span>
                                </div>
                                <div className="project-doc-view">
                                  <div className="line-numbers">
                                    {filteredStagedRows.map((_, index) => <div key={index}>{index + 1}</div>)}
                                  </div>
                                  <div className="project-doc-content">
                                    {filteredStagedRows.length === 0 && <div className="project-doc-empty">{t('no_changes_document')}</div>}
                                    {filteredStagedRows.map((row, index) => {
                                      const currentValue = selectedTargetEntries[row.key] || '';
                                      const nextValue = selectedStagedEntries[row.key] || '';
                                      const hasValueChange = row.status === 'duplicate' && currentValue !== nextValue;
                                      return (
                                        <div key={`${row.status}-${row.key}`} className={`project-doc-line ${row.status} ${hasValueChange ? 'value-change' : ''}`}>
                                          <span className={`status-indicator ${row.status === 'duplicate' ? 'status-deleted' : row.status === 'merged' ? 'status-merged' : 'status-saved'}`}>●</span>
                                          <span className="id-part" style={{ color: leftIdColor }}>{formatPreviewKey(row.key, selectedStagedModFile.name)}</span>
                                          <span className="project-doc-separator">{selectedStagedModFile.name.endsWith('.json') ? ':' : '='}</span>
                                          <input
                                            value={nextValue}
                                            onChange={(event) => updateStagedKeyValue(row.key, event.target.value)}
                                            className="project-doc-inline-input"
                                            style={{ color: leftTextColor }}
                                            aria-label={`${t('text')} ${row.key}`}
                                          />
                                          {row.status === 'duplicate' && (
                                            <div className="duplicate-resolver">
                                              {hasValueChange && <span>{t('value_changed')}</span>}
                                              <button onClick={() => resolveStagedDuplicate(row.key, 'keep')}>{t('keep_current')}</button>
                                              <button onClick={() => resolveStagedDuplicate(row.key, 'use_new')} disabled={!selectedTargetProjectFile}>{t('use_new')}</button>
                                            </div>
                                          )}
                                          <button className="staged-delete-btn doc-delete" onClick={() => removeStagedKey(row.key)} title={t('remove_line')}>
                                            <FaTrash aria-hidden="true" />
                                          </button>
                                          {index === filteredStagedRows.length - 1 && <span className="project-doc-fade" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                              <div className="diff-panel project-preview-panel">
                                <div className="panel-header">
                                  <div className="color-selectors">
                                    <div className="color-circle" style={{ backgroundColor: rightIdColor }} onClick={(e) => openPicker(setShowRightIdPicker, e)} title={t('change_key_color')} />
                                    <div className="color-circle" style={{ backgroundColor: rightTextColor }} onClick={(e) => openPicker(setShowRightTextPicker, e)} title={t('change_text_color')} />
                                  </div>
                                  <span className="filename">{t('current_project')}</span>
                                </div>
                                <div className="project-doc-view">
                                  <div className="line-numbers">
                                    {selectedTargetRows.map((_, index) => <div key={index}>{index + 1}</div>)}
                                  </div>
                                  <div className="project-doc-content" ref={targetPreviewRef}>
                                    {selectedTargetRows.length === 0 && <div className="project-doc-empty">{t('no_target_document')}</div>}
                                    {selectedTargetRows.map((row, index) => {
                                      const previewName = selectedTargetProjectFile?.name || selectedStagedModFile.name;
                                      const separator = previewName.endsWith('.json') ? ':' : '=';
                                      const statusClass = row.status === 'duplicate' ? 'status-deleted' : row.status === 'new' ? 'status-saved' : row.status === 'merged' ? 'status-merged' : 'status-unchanged';
                                      return (
                                        <div key={`${row.status}-${row.key}-${index}`} className={`project-doc-line ${row.status}`}>
                                          <span className={`status-indicator ${statusClass}`}>●</span>
                                          <span className="id-part" style={{ color: rightIdColor }}>{formatPreviewKey(row.key, previewName)}</span>
                                          <span className="project-doc-separator">{separator}</span>
                                          <span className="text-part project-doc-text" style={{ color: rightTextColor }}>{JSON.stringify(row.value)}</span>
                                          {row.status !== 'current' && (
                                            <button className="staged-delete-btn doc-delete" onClick={() => removeStagedKey(row.key)} title={t('remove_line')}>
                                              <FaTrash aria-hidden="true" />
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {stagedModFiles.length === 0 && (
                    <div className="project-empty-state staged-mod-empty">
                      <FaBoxOpen aria-hidden="true" />
                      <h3>{t('no_mod_scanned')}</h3>
                      <p>{t('scan_other_mod')}</p>
                    </div>
                  )}
                </div>
              )}

              {!showAddModPanel && (
              <div className="project-pack-layout">
                <aside className="project-pack-sidebar">
                  <div className="search-box project-search">
                    <FaSearch className="search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder={t('search_project')}
                      value={projectPackSearch}
                      onChange={(e) => setProjectPackSearch(e.target.value)}
                      className="search-input"
                    />
                  </div>
                  <div className="project-filter-row" aria-label={t('advanced_search')}>
                    {(['all', 'pending', 'duplicates', 'empty', 'errors', 'new'] as AdvancedProjectFilter[]).map(filter => (
                      <button
                        key={filter}
                        className={`project-filter-chip ${projectAdvancedFilter === filter ? 'active' : ''}`}
                        onClick={() => setProjectAdvancedFilter(filter)}
                      >
                        {t(`filter_${filter}`)}
                      </button>
                    ))}
                  </div>
                  <div className="project-file-list">
                    {filteredProjectFiles.length === 0 && (
                      <div className="project-empty-note">{t('select_json_folder')}</div>
                    )}
                    {filteredProjectFiles.map((file) => {
                      const realIndex = projectPackFiles.findIndex(item => item.path === file.path);
                      const dirty = file.workingContent !== file.content;
                      return (
                        <button
                          key={file.path}
                          className={`project-file-item ${realIndex === projectPackIndex ? 'active' : ''} ${dirty ? 'has-pending' : ''} ${file.duplicateKeys.length > 0 ? 'has-duplicates' : ''}`}
                          onClick={() => {
                            setProjectPackIndex(realIndex);
                            setPreviewDuplicateKey(null);
                          }}
                          title={file.path}
                        >
                          <span className={`project-file-dot ${file.parseError ? 'error' : dirty ? 'dirty' : file.duplicateKeys.length > 0 ? 'warn' : ''}`} title={file.parseError ? t('errors') : dirty ? t('pending') : t('saved_state')} />
                          <span className="project-file-name">{getDisplayTranslationFileName(file.name)}</span>
                          <span className="project-file-count">{file.keyCount}</span>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="project-pack-main" key={selectedProjectFile?.path || 'project-empty'}>
                  {selectedProjectFile ? (
                    <>
                      <div className="project-editor-header">
                        <div>
                          <span className="empty-kicker">{selectedProjectFile.path}</span>
                          <h3>{selectedProjectFile.name}</h3>
                        </div>
                        <div className="project-workspace-actions compact-actions">
                          <div className="color-selectors project-color-controls">
                            <div className="color-circle" style={{ backgroundColor: leftIdColor }} onClick={(e) => openPicker(setShowLeftIdPicker, e)} title={t('change_key_color')} />
                            <div className="color-circle" style={{ backgroundColor: leftTextColor }} onClick={(e) => openPicker(setShowLeftTextPicker, e)} title={t('change_text_color')} />
                          </div>
                          <button onClick={() => setShowProjectCompare(prev => !prev)} className="btn">
                            <FaEye aria-hidden="true" /> {t('compare')}
                          </button>
                          <button onClick={saveProjectFile} className={`btn primary project-save-button ${selectedProjectFile.workingContent !== selectedProjectFile.content ? 'has-pending' : ''}`} disabled={!!selectedProjectFile.parseError}>
                            <FaSave aria-hidden="true" /> {t('save_format', selectedProjectFile.name.toLowerCase().endsWith('.json') ? 'JSON' : 'TXT')}
                          </button>
                        </div>
                      </div>

                      {(selectedProjectFile.parseError || selectedProjectFile.duplicateKeys.length > 0) && (
                        <div className="project-warning-box">
                          {selectedProjectFile.parseError && <p>{t('invalid_json', selectedProjectFile.parseError)}</p>}
                          {selectedProjectFile.duplicateKeys.length > 0 && <p>{t('internal_duplicates', selectedProjectFile.duplicateKeys.slice(0, 8).join(', '))}</p>}
                        </div>
                      )}

                      {previewDuplicateKey && (
                        <div className="project-duplicate-preview">
                          <strong>{t('selected_duplicate')}</strong>
                          <span>{previewDuplicateKey}</span>
                        </div>
                      )}

                      <div className="project-extra-row">
                        <input
                          value={extraKey}
                          onChange={(e) => setExtraKey(e.target.value)}
                          placeholder={t('new_key')}
                          className="project-extra-input"
                        />
                        <input
                          value={extraValue}
                          onChange={(e) => setExtraValue(e.target.value)}
                          placeholder={t('text')}
                          className="project-extra-input"
                        />
                        <button onClick={addProjectExtra} className="btn" disabled={!extraKey.trim()}>
                          <FaPlus aria-hidden="true" /> {t('add')}
                        </button>
                      </div>

                      {showProjectCompare ? (
                        <div className="project-compare-grid">
                          <div className="project-compare-pane">
                            <span>{t('before')}</span>
                            <textarea className="project-json-editor" value={selectedProjectFile.content} readOnly spellCheck={false} />
                          </div>
                          <div className="project-compare-pane">
                            <span>{t('after')}</span>
                            <div className="project-code-editor">
                              <CodeMirrorEditor
                                value={selectedProjectFile.workingContent}
                                onChange={updateProjectFile}
                                leftIdColor={leftIdColor}
                                leftTextColor={leftTextColor}
                                mode={selectedProjectFile.name.toLowerCase().endsWith('.json') ? 'json' : 'lua'}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="project-json-editor project-code-editor">
                          <CodeMirrorEditor
                            value={selectedProjectFile.workingContent}
                            onChange={updateProjectFile}
                            leftIdColor={leftIdColor}
                            leftTextColor={leftTextColor}
                            mode={selectedProjectFile.name.toLowerCase().endsWith('.json') ? 'json' : 'lua'}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="project-empty-state">
                      <FaLayerGroup aria-hidden="true" />
                      <h3>{t('select_project_folder')}</h3>
                      <p>{t('project_empty_description')}</p>
                    </div>
                  )}
                </div>

                <aside className="project-conflict-panel">
                  <h3>{t('global_search')}</h3>
                  <div className="search-box project-search compact-search">
                    <FaSearch className="search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder={t('search_key_or_text')}
                      value={projectGlobalSearch}
                      onChange={(e) => setProjectGlobalSearch(e.target.value)}
                      className="search-input"
                    />
                  </div>
                  {projectGlobalSearch.trim() && (
                    <div className="project-conflict-list global-results">
                      {projectSearchResults.length === 0 && <p className="project-empty-note">{t('no_files_match')}</p>}
                      {projectSearchResults.map(result => (
                        <button
                          key={`${result.file.path}-${result.key}`}
                          className="project-conflict-item"
                          onClick={() => {
                            setProjectPackIndex(result.fileIndex);
                            setPreviewDuplicateKey(result.key);
                          }}
                        >
                          <strong>{result.key}</strong>
                          <span>{getDisplayTranslationFileName(result.file.name)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <h3>{t('detected_overlaps')}</h3>
                  <div className="project-conflict-list">
                    {projectConflicts.length === 0 && <p className="project-empty-note">{t('no_overlaps')}</p>}
                    {projectConflicts.slice(0, 40).map(conflict => (
                      <button key={conflict.key} className="project-conflict-item" onClick={() => jumpToDuplicate(conflict)}>
                        <strong>{conflict.key}</strong>
                        <span>{t('file_count', conflict.files.length)}</span>
                      </button>
                    ))}
                  </div>
                  <h3><FaHistory aria-hidden="true" /> {t('history')}</h3>
                  <div className="project-conflict-list project-history-list">
                    {projectHistory.length === 0 && <p className="project-empty-note">{t('no_history')}</p>}
                    {projectHistory.map(item => (
                      <div key={item.id} className="project-history-item">
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                        {item.undo && (
                          <button onClick={() => restoreProjectSnapshot(item.undo)} title={t('undo_action')}>
                            <FaUndo aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
              )}
            </section>
          )}

          {!isScanning && !multiScanProgress && project.currFile === -1 && project.files.length > 0 && (
            <div className="no-file">{t('select_file_from_list')}</div>
          )}

          {currentFile && !multiScanProgress && (
            <div className="split-view" key={currentFile.name}>
              <div className="editor-panel">
                <div className="panel-header">
                  <div className="color-selectors">
                    <div className="color-circle" style={{ backgroundColor: leftIdColor }} onClick={(e) => openPicker(setShowLeftIdPicker, e)} title={t('change_id_color')} />
                    <div className="color-circle" style={{ backgroundColor: leftTextColor }} onClick={(e) => openPicker(setShowLeftTextPicker, e)} title={t('change_text_color')} />
                  </div>
                  <span className="filename">{currentFile.name}</span>
                </div>
                <div className="editor-wrapper">
                  <div className="line-numbers" ref={leftNumbersRef}>
                    {currentFile.workingContent.split('\n').map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <CodeMirrorEditor
                    ref={editorRef}
                    value={currentFile.workingContent}
                    onChange={updateCurrentFile}
                    onScroll={handleEditorScroll}
                    leftIdColor={leftIdColor}
                    leftTextColor={leftTextColor}
                    mode={currentFile.name.endsWith('.json') ? 'json' : 'lua'}
                  />
                </div>
              </div>

              <div className="diff-panel">
                <div className="panel-header">
                  <div className="color-selectors">
                    <div className="color-circle" style={{ backgroundColor: rightIdColor }} onClick={(e) => openPicker(setShowRightIdPicker, e)} title={t('change_id_color')} />
                    <div className="color-circle" style={{ backgroundColor: rightTextColor }} onClick={(e) => openPicker(setShowRightTextPicker, e)} title={t('change_text_color')} />
                  </div>
                  <span className="panel-title">{t('differences')}</span>
                </div>
                <DiffView
                  file={currentFile}
                  rightIdColor={rightIdColor}
                  rightTextColor={rightTextColor}
                  emptyText={t('select_file')}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {!showStartScreen && <footer className="status-hud" aria-label={t('state')}>
        <div className="hud-section hud-project" title={showProjectWorkspace ? projectPackName || t('no_project') : currentDirectoryHandle?.name || t('no_project')}>
          <FaFolderOpen aria-hidden="true" />
          <span className="hud-label">{t('project')}</span>
          <strong>{showProjectWorkspace ? projectPackName || t('no_project') : currentDirectoryHandle?.name || t('no_project')}</strong>
        </div>
        <div className="hud-section">
          <FaLanguage aria-hidden="true" />
          <span className="hud-label">{t('language')}</span>
          <strong>{targetLanguageLabel}</strong>
        </div>
        <div className="hud-section">
          <FaCogs aria-hidden="true" />
          <span className="hud-label">{t('mode')}</span>
          <strong>{showProjectWorkspace ? projectPackMode : scanMode}</strong>
        </div>
        <div className="hud-section">
          <FaFileAlt aria-hidden="true" />
          <span className="hud-label">{t('files_title').replace('📄 ', '')}</span>
          <strong>{showProjectWorkspace ? projectBarStats.documents : project.files.length}</strong>
        </div>
        <div className="hud-section">
          <FaKey aria-hidden="true" />
          <span className="hud-label">{showProjectWorkspace ? t('new_keys') : t('strings')}</span>
          <strong>{showProjectWorkspace ? projectBarStats.newKeys : totalKeys}</strong>
        </div>
        <div className={`hud-section hud-save ${(showProjectWorkspace ? projectSaveSummary.dirtyFiles.length : pendingFiles) > 0 ? 'has-pending' : 'is-clean'}`}>
          {(showProjectWorkspace ? projectSaveSummary.dirtyFiles.length : pendingFiles) > 0 ? <FaSave aria-hidden="true" /> : <FaCheck aria-hidden="true" />}
          <span className="hud-label">{t('pending_changes')}</span>
          <strong>{(showProjectWorkspace ? projectSaveSummary.dirtyFiles.length : pendingFiles) > 0 ? (showProjectWorkspace ? projectSaveSummary.dirtyFiles.length : pendingFiles) : t('ok')}</strong>
        </div>
        <div className="hud-section hud-status">
          <FaDatabase aria-hidden="true" />
          <span className="hud-label">{showProjectWorkspace && projectConsole[0] ? t('history') : t('state')}</span>
          <strong>{showProjectWorkspace && projectConsole[0] ? `${projectConsole[0].label}: ${projectConsole[0].detail}` : statusText}</strong>
        </div>
      </footer>}

      {showLeftIdPicker && <ColorPicker color={leftIdColor} onChange={setLeftIdColor} onClose={() => setShowLeftIdPicker(false)} position={pickerPosition} label={t('custom_color')} />}
      {showLeftTextPicker && <ColorPicker color={leftTextColor} onChange={setLeftTextColor} onClose={() => setShowLeftTextPicker(false)} position={pickerPosition} label={t('custom_color')} />}
      {showRightIdPicker && <ColorPicker color={rightIdColor} onChange={setRightIdColor} onClose={() => setShowRightIdPicker(false)} position={pickerPosition} label={t('custom_color')} />}
      {showRightTextPicker && <ColorPicker color={rightTextColor} onChange={setRightTextColor} onClose={() => setShowRightTextPicker(false)} position={pickerPosition} label={t('custom_color')} />}

      <TranslateModal isOpen={showTranslateModal} onClose={() => setShowTranslateModal(false)} onStart={handleTranslate} isTranslating={isTranslating} t={t} />
      <ExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} onExportLocal={handleExportLocal} onExportWorkshop={handleExportWorkshop} t={t} />
      <ExtrasModal
        isOpen={showExtrasModal}
        onClose={() => setShowExtrasModal(false)}
        extras={extras}
        onAdd={addExtra}
        onUpdate={updateExtra}
        onDelete={deleteExtra}
        onExecute={(extra) => executeExtra(extra, t)}
        onImport={(jsonData) => importExtras(jsonData, t)}
        exportData={exportExtras}
        t={t}
      />
      <WorkshopModal isOpen={showWorkshopModal} onClose={() => setShowWorkshopModal(false)} onScanSelected={handleWorkshopScan} t={t} />
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} t={t} />
      <PreviewModal isOpen={showPreviewModal} onClose={() => setShowPreviewModal(false)} content={currentFile?.workingContent || ''} onApply={updateCurrentFile} t={t} />
      <AIAssistantModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        fileName={activeAIFile?.name}
        content={activeAIFile?.content}
        targetLang={targetLang}
        onApply={(content) => activeAIFile?.apply(content)}
        onSelectIssue={handleSelectAIIssue}
        t={t}
      />
    </div>
  );
}

export default App;
