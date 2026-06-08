import React from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import './DiffNavigation.css';

interface DiffNavigationProps {
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  prevTitle?: string;
  nextTitle?: string;
}

const DiffNavigation: React.FC<DiffNavigationProps> = ({ onPrev, onNext, disabled, prevTitle = 'Previous difference', nextTitle = 'Next difference' }) => {
  return (
    <div className="diff-nav">
      <button onClick={onPrev} disabled={disabled} title={prevTitle}>
        <FaChevronUp aria-hidden="true" />
      </button>
      <button onClick={onNext} disabled={disabled} title={nextTitle}>
        <FaChevronDown aria-hidden="true" />
      </button>
    </div>
  );
};

export default DiffNavigation;
