import React, { useState } from 'react';
import { DatabaseTreeSidebar } from '../Explorer/DatabaseTreeSidebar';
import databaseIcon from '../../assets/database_svg.svg';
import profileIcon from '../../assets/profile_icon.svg';
import settingsIcon from '../../assets/settings.svg';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [explorerOpen, setExplorerOpen] = useState(false);

  return (
    <div className="new-dashboard-layout">
      <aside className="new-sidebar">
        <div className="sidebar-top-group">
          <div className="sidebar-logo-container">
            <img src="/src/assets/logo.png" alt="Logo" className="sidebar-logo" />
          </div>
          <div
            className="sidebar-icon explorer-toggle-icon"
            onClick={() => setExplorerOpen(prev => !prev)}
            title="Обозреватель БД"
          >
            <img src={databaseIcon} alt="Обозреватель БД" className="sidebar-icon-img" />
          </div>
        </div>
        <div className="sidebar-bottom-icons">
          <div className="sidebar-icon user-icon">
            <img src={profileIcon} alt="Профиль" className="sidebar-icon-img" />
          </div>
          <div className="sidebar-icon settings-icon">
            <img src={settingsIcon} alt="Настройки" className="sidebar-icon-img" />
          </div>
        </div>
      </aside>

      {explorerOpen && (
        <div className="explorer-backdrop" onClick={() => setExplorerOpen(false)} />
      )}
      <div className={`explorer-panel ${explorerOpen ? 'explorer-panel-open' : ''}`}>
        <DatabaseTreeSidebar
          collapsed={false}
          onToggleCollapse={() => setExplorerOpen(false)}
          onSelectStandardSchema={() => setExplorerOpen(false)}
          onSelectGenericTable={() => setExplorerOpen(false)}
          onLogout={() => setExplorerOpen(false)}
        />
      </div>

      <div className="new-main-container">
        {children}
      </div>
    </div>
  );
};
