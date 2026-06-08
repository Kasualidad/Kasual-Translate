import React from 'react';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import './WarningPopup.css';

interface WarningPopupProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  actionLabel?: string;
}

const WarningPopup: React.FC<WarningPopupProps> = ({ isOpen, title, message, onClose, actionLabel = 'OK' }) => {
  const { shouldRender, isClosing, requestClose } = useModalLifecycle(isOpen, onClose);

  if (!shouldRender) return null;

  return (
    <div className={`warning-popup-backdrop ${isClosing ? 'is-closing' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="warning-popup-title">
      <div className="warning-popup">
        <button className="warning-popup-close" onClick={requestClose} aria-label={actionLabel} disabled={isClosing}>
          <FaTimes aria-hidden="true" />
        </button>
        <div className="warning-popup-icon">
          <FaExclamationTriangle aria-hidden="true" />
        </div>
        <div className="warning-popup-copy">
          <h2 id="warning-popup-title">{title}</h2>
          <p>{message}</p>
        </div>
        <button className="btn btn-danger warning-popup-action" onClick={requestClose} disabled={isClosing}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

export default WarningPopup;
