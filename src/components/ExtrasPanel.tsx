import React from 'react';
import type { Extra } from '../types';
import './ExtrasPanel.css';

interface ExtrasPanelProps {
  extras: Extra[];
  onExecute: (extra: Extra) => void;
  onOpenManager: () => void;
}

const ExtrasPanel: React.FC<ExtrasPanelProps> = ({ extras, onExecute, onOpenManager }) => {
  return (
    <div className="extras-panel">
      <div className="extras-header">
        <span>⚙️ EXTRAS</span>
        <button onClick={onOpenManager} className="manage-btn" title="Administrar extras">
          ⚙️
        </button>
      </div>
      <div className="extras-buttons">
        {extras.map(extra => (
          <button
            key={extra.id}
            className="extra-button"
            onClick={() => onExecute(extra)}
            title={extra.name}
          >
            <span className="extra-button-icon">{extra.icon}</span>
            <span className="extra-button-name">{extra.name}</span>
          </button>
        ))}
        {extras.length === 0 && (
          <div className="no-extras-message">
            No hay extras. Haz clic en ⚙️ para añadir.
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtrasPanel;
