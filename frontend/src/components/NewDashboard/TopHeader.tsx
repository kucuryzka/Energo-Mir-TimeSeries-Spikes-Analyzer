import React, { useState } from 'react';
import { Switch } from 'antd';
import './TopHeader.css';

export const TopHeader: React.FC = () => {
  const [isLegacy, setIsLegacy] = useState(() => document.body.classList.contains('theme-legacy'));

  const toggleTheme = (checked: boolean) => {
    setIsLegacy(checked);
    if (checked) {
      document.body.classList.add('theme-legacy');
    } else {
      document.body.classList.remove('theme-legacy');
    }
  };

  return (
    <header className="new-top-header">
      <div className="new-header-title">
        ДЕТЕКТОР АНОМАЛИЙ
      </div>
      <div className="new-header-status">
        <div className="status-dot"></div>
        Система активна
      </div>
      <nav className="new-header-nav">
        <span>Мониторинг</span>
        <span className="nav-dot"></span>
        <span>Детекция</span>
        <span className="nav-dot"></span>
        <span>Визуализация</span>
        <div style={{ marginLeft: 24, display: 'flex', alignItems: 'center' }}>
          <Switch 
            size="small" 
            checked={isLegacy} 
            onChange={toggleTheme} 
            style={{ backgroundColor: isLegacy ? '#2a5298' : '#AEAC55' }}
          />
        </div>
      </nav>
    </header>
  );
};
