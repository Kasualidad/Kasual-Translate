import React, { useState, useEffect } from 'react';
import type { ProjectData } from '../types';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './ProjectModal.css';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: (name: string) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: (name: string) => void;
  onImport: (file: File) => void;
  projectList: string[];
  currentProject: ProjectData | null;
  t: (key: string, ...args: Array<string | number>) => string;
}

const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateNew,
  onLoad,
  onDelete,
  onExport,
  onImport,
  projectList,
  currentProject,
  t
}) => {
  const [newProjectName, setNewProjectName] = useState('');
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      // Clear draft name after closing so the next project starts clean.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewProjectName('');
    }
  }, [isOpen]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onCreateNew(newProjectName.trim());
      setNewProjectName('');
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = ''; // reset
    }
  };

  if (!shouldRender) return null;

  return (
    <div className={`modal-overlay ${isClosing ? 'is-closing' : ''}`}>
      <div className="modal-box project-modal">
        <h2 className="modal-title">{t('project_manager')}</h2>

        <div className="project-content">
          <form onSubmit={handleCreate} className="project-form">
            <h3>{t('create_project')}</h3>
            <div className="form-row">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={t('project_name_placeholder')}
                className="text-input"
                autoFocus
              />
              <button type="submit" className="btn primary" disabled={!newProjectName.trim()}>
                {t('create')}
              </button>
            </div>
          </form>

          <div className="saved-projects">
            <h3>{t('saved_projects')}</h3>
            {projectList.length === 0 ? (
              <p className="no-projects">{t('no_saved_projects')}</p>
            ) : (
              <ul className="project-list">
                {projectList.map(name => (
                  <li key={name} className={`project-item ${currentProject?.name === name ? 'active' : ''}`}>
                    <span className="project-name">{name}</span>
                    <div className="project-actions">
                      <button onClick={() => onLoad(name)} className="btn small" title={t('load')}>📂</button>
                      <button onClick={() => onExport(name)} className="btn small" title={t('export')}>📤</button>
                      <button onClick={() => onDelete(name)} className="btn small danger" title={t('delete')}>🗑️</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="import-project">
            <h3>{t('import_project')}</h3>
            <div className="import-controls">
              <input
                type="file"
                id="import-project-file"
                accept=".kproject,.json"
                onChange={handleImport}
                className="file-input"
              />
              <label htmlFor="import-project-file" className="btn">
                📥 {t('select_file')}
              </label>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={requestClose} className="btn" disabled={isClosing}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
