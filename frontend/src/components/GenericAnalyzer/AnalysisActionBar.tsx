import React from 'react';
import { Button } from 'antd';
import { SearchOutlined, TableOutlined, FileExcelOutlined } from '@ant-design/icons';

const analyzeButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #2a5298 0%, #1a3a6b 100%)',
  border: 'none',
  borderRadius: 8,
  height: 48,
  fontSize: 16,
  fontWeight: 600,
  boxShadow: '0 4px 12px rgba(42, 82, 152, 0.3)',
};

interface AnalysisActionBarProps {
  onAnalyze: () => void;
  loading: boolean;
  previewOpen: boolean;
  onPreviewToggle: () => void;
  previewContent: React.ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const AnalysisActionBar: React.FC<AnalysisActionBarProps> = ({
  onAnalyze,
  loading,
  previewOpen,
  onPreviewToggle,
  previewContent,
  onExport,
  exportDisabled = false,
  className,
  style,
}) => (
  <div className={className} style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...style }}>
    <div style={{ display: 'flex', gap: 8, height: 48 }}>
      <Button
        type="primary"
        onClick={onAnalyze}
        loading={loading}
        size="large"
        icon={<SearchOutlined />}
        style={{ ...analyzeButtonStyle, flex: '1 1 auto', minWidth: 0 }}
      >
        {loading ? 'Анализируем...' : 'Анализировать'}
      </Button>
      {onExport && (
        <Button
          size="large"
          icon={<FileExcelOutlined />}
          onClick={onExport}
          disabled={exportDisabled}
          title="Экспорт в Excel"
          style={{ flex: '0 0 48px', minWidth: 48, height: 48, borderRadius: 8 }}
        />
      )}
      <Button
        size="large"
        icon={<TableOutlined />}
        onClick={onPreviewToggle}
        title="Образец данных в таблице"
        aria-expanded={previewOpen}
        style={{
          flex: '0 0 48px',
          minWidth: 48,
          height: 48,
          borderRadius: 8,
          ...(previewOpen
            ? { borderColor: '#2a5298', color: '#2a5298', background: '#f0f5ff' }
            : {}),
        }}
      />
    </div>
    {previewOpen && (
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        {previewContent}
      </div>
    )}
  </div>
);
