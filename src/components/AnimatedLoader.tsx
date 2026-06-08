import React from 'react';
import './AnimatedLoader.css';

interface AnimatedLoaderProps {
  text?: string;
  size?: 'small' | 'medium' | 'large';
}

const AnimatedLoader: React.FC<AnimatedLoaderProps> = ({ text, size = 'medium' }) => {
  return (
    <div className={`animated-loader ${size}`}>
      <div className="loader-penguin">
        <svg viewBox="0 0 100 100" className="penguin-svg">
          <ellipse cx="50" cy="60" rx="20" ry="22" fill="#2a2a2a" />
          <ellipse cx="50" cy="60" rx="12" ry="15" fill="#eef2f5" />
          <circle cx="40" cy="48" r="4" fill="white" />
          <circle cx="60" cy="48" r="4" fill="white" />
          <circle cx="42" cy="46" r="2" fill="black" />
          <circle cx="58" cy="46" r="2" fill="black" />
          <polygon points="50,53 53,57 47,57" fill="#f4a261" />
          <rect x="35" y="28" width="30" height="8" fill="#e65f3c" rx="4" />
          <circle cx="50" cy="28" r="6" fill="#e65f3c" />
        </svg>
        <div className="loader-shadow"></div>
      </div>
      {text && <div className="loader-text">{text}</div>}
    </div>
  );
};

export default AnimatedLoader;