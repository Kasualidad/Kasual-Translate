import React, { useMemo } from 'react';
import type { TranslationFile } from '../types';
import './FileList.css';

interface FileListProps {
  files: TranslationFile[];
  currentFile: number;
  onSelectFile: (index: number) => void;
  searchTerm: string;
  sortBy: 'name' | 'status';
  t: (key: string, ...args: Array<string | number>) => string;
}

const FileList: React.FC<FileListProps> = ({ files, currentFile, onSelectFile, searchTerm, sortBy, t }) => {
  const getFileStatus = (file: TranslationFile): 'unsaved' | 'saved' | 'unchanged' => {
    if (file.workingContent !== file.committedContent) return 'unsaved';
    if (file.committedContent !== file.originalContent) return 'saved';
    return 'unchanged';
  };

  const getDisplayName = (fileName: string): string => {
    if (fileName.endsWith('.json')) {
      return fileName.replace(/_[A-Z]{2,4}\.json$/, '.json');
    }
    return fileName;
  };

  const filteredAndSortedFiles = useMemo(() => {
    let filtered = [...files];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(term));
    }
    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        const statusA = getFileStatus(a);
        const statusB = getFileStatus(b);
        const order = { unsaved: 0, saved: 1, unchanged: 2 };
        return order[statusA] - order[statusB];
      }
    });
  }, [files, searchTerm, sortBy]);

  return (
    <div className="file-list">
      <div className="file-items">
        {filteredAndSortedFiles.length === 0 ? (
          <div className="no-files">
            {files.length === 0 ? t('no_files_loaded') : t('no_files_match')}
          </div>
        ) : (
          filteredAndSortedFiles.map((file) => {
            const originalIndex = files.findIndex(f => f.name === file.name);
            const status = getFileStatus(file);
            return (
              <div
                key={file.name}
                className={`file-item ${originalIndex === currentFile ? 'active' : ''} status-${status}`}
                onClick={() => onSelectFile(originalIndex)}
                title={file.name}
              >
                <span className="file-status"></span>
                <span className="file-name">{getDisplayName(file.name)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FileList;
