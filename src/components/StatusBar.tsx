import React from 'react';

interface StatusBarProps {
  projectName: string | null;
  fileCount: number;
  totalKeys: number;
  currentMode: string;
}

const StatusBar: React.FC<StatusBarProps> = ({ projectName, fileCount, totalKeys, currentMode }) => {
  return (
    <div className="status-bar">
      <div className="status-bar-item">
        <span className="label">Proyecto:</span>
        <span className="value">{projectName || 'Ninguno'}</span>
      </div>
      <div className="status-bar-item">
        <span className="label">Archivos:</span>
        <span className="value">{fileCount}</span>
      </div>
      <div className="status-bar-item">
        <span className="label">Cadenas:</span>
        <span className="value">{totalKeys}</span>
      </div>
      <div className="status-bar-item">
        <span className="label">Modo:</span>
        <span className="mode-badge">{currentMode}</span>
      </div>
    </div>
  );
};

export default StatusBar;