import React from 'react';
import { UserOutlined, SettingOutlined } from '@ant-design/icons';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="new-dashboard-layout">
      <aside className="new-sidebar">
        <div className="sidebar-logo-container">
          <img src="/src/assets/logo.png" alt="Logo" className="sidebar-logo" />
        </div>
        <div className="sidebar-bottom-icons">
          <div className="sidebar-icon user-icon">
            <UserOutlined style={{ fontSize: '20px' }} />
          </div>
          <div className="sidebar-icon settings-icon">
            <SettingOutlined style={{ fontSize: '20px' }} />
          </div>
        </div>
      </aside>
      <div className="new-main-container">
        {children}
      </div>
    </div>
  );
};
