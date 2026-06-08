import React, { useState, useEffect } from 'react';
import type { WorkshopMod } from '../types';
import { scanWorkshopFolder } from '../services/workshopScanner';
import type { ScanProgress } from '../services/workshopScanner';
import { FaCheckCircle, FaCheckDouble, FaEye, FaFilter, FaFolderOpen, FaHammer, FaListUl, FaSearch, FaTimes, FaUndo } from 'react-icons/fa';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './WorkshopModal.css';

interface WorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSelected: (handles: FileSystemDirectoryHandle[]) => void;
  t: (key: string, ...args: Array<string | number>) => string;
}

type SortOption = 'selected_first' | 'name_asc' | 'name_desc' | 'id_asc' | 'id_desc' | 'author_asc';
type FilterOption = 'all' | 'selected' | 'unselected';

const WorkshopModal: React.FC<WorkshopModalProps> = ({ isOpen, onClose, onScanSelected, t }) => {
  const [workshopHandle, setWorkshopHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [mods, setMods] = useState<WorkshopMod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('selected_first');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [selectedMod, setSelectedMod] = useState<WorkshopMod | null>(null);
  const [lastFolder, setLastFolder] = useState<string | null>(null);
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  // Cargar última carpeta de localStorage al abrir
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('kasual_last_workshop_folder');
      setLastFolder(saved);
    }
  }, [isOpen]);

  const handleBrowse = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setWorkshopHandle(handle);
      localStorage.setItem('kasual_last_workshop_folder', handle.name);
      setLastFolder(handle.name);
      await loadMods(handle);
    } catch {
      // Usuario canceló
    }
  };

  const loadMods = async (handle: FileSystemDirectoryHandle) => {
    setIsLoading(true);
    setProgress(null);
    setMods([]);
    setSelectedMod(null);
    try {
      const scannedMods = await scanWorkshopFolder(handle, (prog) => setProgress(prog));
      setMods(scannedMods);
    } catch (error) {
      console.error('Error al escanear workshop:', error);
      alert(t('scan_error'));
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const toggleModSelection = (mod: WorkshopMod) => {
    setMods(prev => prev.map(m => m.id === mod.id ? { ...m, selected: !m.selected } : m));
  };

  const selectVisible = () => {
    const visibleIds = new Set(filteredMods.map(mod => mod.id));
    setMods(prev => prev.map(mod => visibleIds.has(mod.id) ? { ...mod, selected: true } : mod));
  };

  const deselectVisible = () => {
    const visibleIds = new Set(filteredMods.map(mod => mod.id));
    setMods(prev => prev.map(mod => visibleIds.has(mod.id) ? { ...mod, selected: false } : mod));
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterBy('all');
    setSortBy('selected_first');
  };

  // Calcular mods filtrados y ordenados directamente en el render
  const getFilteredMods = (): WorkshopMod[] => {
    let result = [...mods];
    
    // Filtrar por búsqueda
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(mod => 
        (mod.name && mod.name.toLowerCase().includes(term)) ||
        (mod.id && mod.id.toLowerCase().includes(term)) ||
        (mod.author && mod.author.toLowerCase().includes(term)) ||
        (mod.description && mod.description.toLowerCase().includes(term))
      );
    }

    if (filterBy === 'selected') result = result.filter(mod => mod.selected);
    if (filterBy === 'unselected') result = result.filter(mod => !mod.selected);
    
    // Ordenar
    result.sort((a, b) => {
      switch (sortBy) {
        case 'selected_first':
          if (a.selected !== b.selected) return a.selected ? -1 : 1;
          return (a.name || '').localeCompare(b.name || '');
        case 'name_asc': return (a.name || '').localeCompare(b.name || '');
        case 'name_desc': return (b.name || '').localeCompare(a.name || '');
        case 'id_asc': return (a.id || '').localeCompare(b.id || '');
        case 'id_desc': return (b.id || '').localeCompare(a.id || '');
        case 'author_asc': return (a.author || '').localeCompare(b.author || '') || (a.name || '').localeCompare(b.name || '');
        default: return 0;
      }
    });
    
    return result;
  };

  const filteredMods = getFilteredMods();
  const selectedCount = mods.filter(mod => mod.selected).length;

  const handleScan = () => {
    const handles = mods.filter(m => m.selected).map(m => m.handle);
    if (handles.length === 0) {
      alert(t('no_mods_selected'));
      return;
    }
    onScanSelected(handles);
    requestClose();
  };

  if (!shouldRender) return null;

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box workshop-modal">
        <div className="workshop-topbar">
          <h2 className="modal-title">
            <span className="modal-title-icon"><FaHammer aria-hidden="true" /></span>
            {t('workshop_scan_title').replace('🛠️ ', '')}
          </h2>

          <div className="folder-selector">
            <input
              type="text"
              value={workshopHandle ? workshopHandle.name : lastFolder || ''}
              placeholder={t('workshop_path')}
              className="text-input"
              readOnly
            />
            <button onClick={handleBrowse} className="btn primary browse-btn">
              <FaFolderOpen aria-hidden="true" /> {t('browse')}
            </button>
          </div>
        </div>

        {(lastFolder && !workshopHandle) || (isLoading && progress) ? (
          <div className="workshop-utility-row">
            {lastFolder && !workshopHandle && (
              <div className="last-folder-prompt">
                <span>{t('last_folder')} <strong>{lastFolder}</strong></span>
                <button onClick={handleBrowse} className="btn small">
                  <FaUndo aria-hidden="true" /> {t('reload')}
                </button>
              </div>
            )}

            {isLoading && progress && (
              <div className="workshop-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
                <div className="progress-text">
                  {t('loading_with_count', progress.current, progress.total)} ({progress.currentMod})
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="workshop-controls">
          <div className="search-box">
            <FaSearch className="search-icon" aria-hidden="true" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('search_mods')}
              className="text-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search" title={t('clear')} aria-label={t('clear')}>
                <FaTimes aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="filter-controls" aria-label={t('filter')}>
            <FaFilter aria-hidden="true" />
            <button className={`filter-chip ${filterBy === 'all' ? 'active' : ''}`} onClick={() => setFilterBy('all')}>
              {t('filter_all')}
            </button>
            <button className={`filter-chip ${filterBy === 'selected' ? 'active' : ''}`} onClick={() => setFilterBy('selected')}>
              {t('filter_selected')}
            </button>
            <button className={`filter-chip ${filterBy === 'unselected' ? 'active' : ''}`} onClick={() => setFilterBy('unselected')}>
              {t('filter_unselected')}
            </button>
          </div>
          <div className="sort-controls">
            <span className="sort-label">{t('sort_by')}</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="sort-select">
              <option value="selected_first">{t('sort_selected_first')}</option>
              <option value="name_asc">{t('sort_name_asc')}</option>
              <option value="name_desc">{t('sort_name_desc')}</option>
              <option value="id_asc">{t('sort_id_asc')}</option>
              <option value="id_desc">{t('sort_id_desc')}</option>
              <option value="author_asc">{t('sort_author_asc')}</option>
            </select>
          </div>
        </div>

        <div className="selection-controls">
          <button onClick={selectVisible} className="btn small" disabled={filteredMods.length === 0}>
            <FaCheckDouble aria-hidden="true" /> {t('select_visible')}
          </button>
          <button onClick={deselectVisible} className="btn small" disabled={filteredMods.length === 0}>
            <FaTimes aria-hidden="true" /> {t('deselect_visible')}
          </button>
          <button onClick={clearFilters} className="btn small">
            <FaUndo aria-hidden="true" /> {t('clear_filters')}
          </button>
        </div>

        <div className="workshop-status-strip" aria-live="polite">
          <span className="workshop-stat">
            <FaListUl aria-hidden="true" />
            <strong>{mods.length}</strong>
            {t('workshop_mods_detected')}
          </span>
          <span className="workshop-stat">
            <FaEye aria-hidden="true" />
            <strong>{filteredMods.length}</strong>
            {t('workshop_mods_visible')}
          </span>
          <span className={`workshop-stat selected ${selectedCount > 0 ? 'is-active' : ''}`}>
            <FaCheckCircle aria-hidden="true" />
            <strong>{selectedCount}</strong>
            {t('workshop_mods_selected')}
          </span>
        </div>

        <div className="workshop-browser">
          <div className="workshop-grid-container">
            {isLoading && mods.length === 0 ? (
              <div className="loading-message">{t('loading_mods')}</div>
            ) : filteredMods.length === 0 ? (
              <div className="no-mods-message">
                {mods.length === 0
                  ? t('select_folder_prompt')
                  : t('no_mods_found')}
              </div>
            ) : (
              <div className="workshop-grid">
                {filteredMods.map(mod => (
                  <div
                    key={mod.id}
                    className={`workshop-card ${mod.selected ? 'selected' : ''}`}
                    onClick={() => toggleModSelection(mod)}
                    onMouseEnter={() => setSelectedMod(mod)}
                  >
                    <img src={mod.imageUrl} alt={mod.name} className="workshop-image" />
                    {mod.selected && (
                      <span className="workshop-selected-badge">
                        <FaCheckCircle aria-hidden="true" /> {t('workshop_selected_badge')}
                      </span>
                    )}
                    <div className="workshop-name" title={mod.name}>{mod.name}</div>
                    <div className="workshop-id">{mod.id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className={`preview-panel ${selectedMod ? 'has-preview' : ''}`}>
            <h4>{t('preview')}</h4>
            {selectedMod ? (
              <div className="preview-content">
                <img src={selectedMod.imageUrl} alt={selectedMod.name} className="preview-image" />
                <div className="preview-details">
                  <div className="preview-field">
                    <span className="preview-label">{t('preview_name')}:</span>
                    <span className="preview-value">{selectedMod.name}</span>
                  </div>
                  <div className="preview-field">
                    <span className="preview-label">ID:</span>
                    <span className="preview-value">{selectedMod.id}</span>
                  </div>
                  {selectedMod.author && (
                    <div className="preview-field">
                      <span className="preview-label">{t('preview_author')}:</span>
                      <span className="preview-value">{selectedMod.author}</span>
                    </div>
                  )}
                  {selectedMod.description && (
                    <div className="preview-field">
                      <span className="preview-label">{t('preview_description')}:</span>
                      <span className="preview-value">{selectedMod.description}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-mods-message">
                {mods.length === 0 ? t('select_folder_prompt') : t('preview')}
              </div>
            )}
          </aside>
        </div>

        <div className="modal-actions">
          <button onClick={requestClose} className="btn" disabled={isClosing}>
            <FaTimes aria-hidden="true" /> {t('cancel')}
          </button>
          <button
            onClick={handleScan}
            className="btn primary"
            disabled={selectedCount === 0}
          >
            <FaSearch aria-hidden="true" /> {t('scan_selected')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkshopModal;
