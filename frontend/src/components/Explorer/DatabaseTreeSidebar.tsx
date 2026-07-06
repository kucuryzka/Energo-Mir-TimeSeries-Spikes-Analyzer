import React from 'react';
import { Tree, Input, Typography } from 'antd';
import { DatabaseOutlined, TableOutlined, SearchOutlined } from '@ant-design/icons';

const { DirectoryTree } = Tree;

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectStandardSchema: () => void;
  onSelectGenericTable: () => void;
  onLogout: () => void;
}

export const DatabaseTreeSidebar: React.FC<SidebarProps> = ({ onSelectStandardSchema }) => {
  const treeData = [
    {
      title: 'Production_Cluster',
      key: '0-0',
      icon: <DatabaseOutlined style={{ color: '#3B65D9' }} />,
      children: [
        {
          title: 'dbo_telemetry',
          key: '0-0-0',
          icon: <TableOutlined style={{ color: '#7A8B9E' }} />,
          isLeaf: true,
        },
        {
          title: 'em_protocol_logs',
          key: '0-0-1',
          icon: <TableOutlined style={{ color: '#7A8B9E' }} />,
          isLeaf: true,
        },
      ],
    },
    {
      title: 'Archive_Storage',
      key: '0-1',
      icon: <DatabaseOutlined style={{ color: '#7A8B9E' }} />,
      children: [
        {
          title: 'history_2025',
          key: '0-1-0',
          icon: <TableOutlined style={{ color: '#7A8B9E' }} />,
          isLeaf: true,
        },
      ],
    },
  ];

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20, height: '100%', background: '#FFF' }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A2332' }}>
          Источники данных
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Выберите таблицу для анализа аномалий
        </Typography.Text>
      </div>

      <Input 
        placeholder="Поиск таблиц..." 
        prefix={<SearchOutlined style={{ color: '#A3AED0' }} />} 
        style={{ borderRadius: 10, background: '#F4F7FE', border: 'none', height: 38 }}
      />

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
        <DirectoryTree
          multiple
          defaultExpandAll
          treeData={treeData}
          onSelect={() => onSelectStandardSchema()}
          style={{ background: 'transparent' }}
        />
      </div>
    </div>
  );
};