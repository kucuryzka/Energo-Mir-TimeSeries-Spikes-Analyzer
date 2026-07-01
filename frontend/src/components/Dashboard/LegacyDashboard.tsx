import React, { useState, useEffect } from 'react';
import { Spin, Alert, Tabs } from 'antd';
import { LegacyEmProtocolDashboard } from './LegacyEmProtocolDashboard';
import { LegacyDboDashboard } from './LegacyDboDashboard';
import { analyticsApi } from '../../api/analyticsApi';
import type { DataSourceDto } from '../../types/analytics.types';

export const LegacyDashboard: React.FC = () => {
  const [sources, setSources] = useState<DataSourceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>('');

  useEffect(() => {
    analyticsApi.getSources()
      .then(data => {
        setSources(data);
        if (data.length > 0) setActiveKey(data[0].id);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (error) return <Alert type="error" message={error} style={{ margin: 20 }} />;

  return (
    <div className="app-container">
      <header className="app-header" style={{ paddingBottom: 0 }}>
        <div className="app-header-content" style={{ alignItems: 'flex-start' }}>
          <div className="app-title" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div>
              <h1>Детектор аномалий</h1>
              <p className="subtitle">Обнаружение выбросов и аномалий в данных</p>
            </div>
            <Tabs 
              activeKey={activeKey}
              onChange={setActiveKey}
              size="middle"
              style={{ marginBottom: -1, marginTop: 16 }}
              items={sources.map(s => ({ label: s.name, key: s.id }))}
            />
          </div>
          <div className="app-header-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span className="badge" style={{ marginTop: 8 }}>
              🟢 Система активна
            </span>
          </div>
        </div>
      </header>

      {activeKey === 'em_protocol' ? (
        <LegacyEmProtocolDashboard />
      ) : activeKey === 'Dbo' ? (
        <LegacyDboDashboard />
      ) : (
        <Alert type="warning" message="Неизвестный источник" style={{ margin: 24 }} />
      )}
    </div>
  );
};
