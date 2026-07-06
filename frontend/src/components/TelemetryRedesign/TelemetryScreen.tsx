import React, { useState } from 'react';
import { Drawer, Badge } from 'antd';
import { DashboardOutlined, ApiOutlined } from '@ant-design/icons';
import { DatabaseTreeSidebar } from '../Explorer/DatabaseTreeSidebar';
import { GenericAnalyzer } from '../GenericAnalyzer/GenericAnalyzer';
import { TelemetryContent, type TabKey } from './TelemetryContent';
import { isMockMode } from '../../mocks/mockMode';
import { useQueryTracker } from '../QueryTracker/QueryTracker';
import { API_BASE_URL } from '../../api/index';
import './TelemetryScreen.css';

interface TelemetryScreenProps {
  onLogout: () => void;
}

interface GenericConfig {
  db: string;
  schema: string;
  table: string;
  timeColumn: string;
}

export const TelemetryScreen: React.FC<TelemetryScreenProps> = ({ onLogout }) => {
  const [selectedDb, setSelectedDb] = useState<string>(isMockMode() ? 'MockDB' : '');
  const [activeTab, setActiveTab] = useState<TabKey>('dbo');
  const [dbDrawerOpen, setDbDrawerOpen] = useState(false);
  const [genericConfig, setGenericConfig] = useState<GenericConfig | null>(null);

  const { open: openQueryTracker, activeCount } = useQueryTracker();

  const handleSelectStandardSchema = (db: string, schema: string) => {
    setGenericConfig(null);
    setSelectedDb(db);
    setActiveTab(schema === 'em_protocol' ? 'em' : 'dbo');
    setDbDrawerOpen(false);
  };

  const handleSelectGenericTable = (db: string, schema: string, table: string, col: string) => {
    setGenericConfig({ db, schema, table, timeColumn: col });
    setDbDrawerOpen(false);
  };

  return (
    <div className="page">
      <div className="app-bg">
        <div className="blob1" />
        <div className="blob2" />
        <div className="shell">
          <div className="sidebar">
            <div className="logo">М</div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <div
                className={`nav-item ${!genericConfig ? 'active' : ''}`}
                title="Дашборд"
                onClick={() => setGenericConfig(null)}
                style={{ cursor: 'pointer' }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
                  <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
                </svg>
              </div>
              <div className="nav-dot" />
            </div>

            <div className="nav-item" title="Источники данных" onClick={() => setDbDrawerOpen(true)} style={{ cursor: 'pointer' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <ellipse cx="12" cy="6" rx="8" ry="3" />
                <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
                <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
              </svg>
            </div>

            <div style={{ flex: 1 }} />

            <div
              className="nav-item"
              title="Панель Hangfire"
              onClick={() => window.open(`${API_BASE_URL}/hangfire`, '_blank')}
              style={{ cursor: 'pointer' }}
            >
              <DashboardOutlined style={{ fontSize: 19 }} />
            </div>
            <div className="nav-item" title="Сетевые запросы" onClick={openQueryTracker} style={{ cursor: 'pointer' }}>
              <Badge count={activeCount} size="small" offset={[2, -2]}>
                <ApiOutlined style={{ fontSize: 19, color: activeCount > 0 ? '#3D63DD' : 'inherit' }} />
              </Badge>
            </div>

            <div className="nav-item" title="Настройки">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              </svg>
            </div>
          </div>

          <div className="content">
            {genericConfig ? (
              <GenericAnalyzer
                db={genericConfig.db}
                schema={genericConfig.schema}
                table={genericConfig.table}
                timeColumn={genericConfig.timeColumn}
                onBack={() => setGenericConfig(null)}
              />
            ) : selectedDb ? (
              <TelemetryContent database={selectedDb} activeTab={activeTab} onActiveTabChange={setActiveTab} />
            ) : (
              <div className="telemetry-empty" style={{ margin: 'auto' }}>
                Откройте панель источников данных слева и выберите базу/схему для анализа.
              </div>
            )}
          </div>
        </div>
      </div>

      <Drawer
        title={null}
        placement="left"
        width={320}
        onClose={() => setDbDrawerOpen(false)}
        open={dbDrawerOpen}
        styles={{ body: { padding: 0 } }}
        closable={false}
      >
        <DatabaseTreeSidebar
          collapsed={false}
          onToggleCollapse={() => setDbDrawerOpen(false)}
          onSelectStandardSchema={handleSelectStandardSchema}
          onSelectGenericTable={handleSelectGenericTable}
          onLogout={onLogout}
        />
      </Drawer>
    </div>
  );
};
