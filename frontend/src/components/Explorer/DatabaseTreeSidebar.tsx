import React, { useState, useEffect, useMemo } from 'react';
import { Tree, message, Spin, Typography, Button, Input } from 'antd';
import { DatabaseOutlined, FolderOutlined, TableOutlined, FieldTimeOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons';
import { explorerApi } from '../../api/explorerApi';

const { Text } = Typography;

interface DataNode {
  title: string | React.ReactNode;
  key: string;
  isLeaf?: boolean;
  children?: DataNode[];
  icon?: React.ReactNode;
  dataRef?: any;
}

interface DatabaseTreeSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectStandardSchema: (db: string, schema: string) => void;
  onSelectGenericTable: (db: string, schema: string, table: string, timeCol: string) => void;
  onLogout: () => void;
}

export const DatabaseTreeSidebar: React.FC<DatabaseTreeSidebarProps> = ({
  collapsed,
  onToggleCollapse: _onToggleCollapse,
  onSelectStandardSchema,
  onSelectGenericTable,
  onLogout,
}) => {
  const [allTreeData, setAllTreeData] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const dbs = await explorerApi.getDatabases();
      setAllTreeData(dbs.map((db: string) => ({
        title: db,
        key: `db|${db}`,
        icon: <DatabaseOutlined />,
      })));
    } catch (e) {
      message.error('Ошибка загрузки БД');
    } finally {
      setLoading(false);
    }
  };

  const onLoadData = async (node: any) => {
    const { key, children } = node;
    if (children) {
      return;
    }
    
    const parts = (key as string).split('|');
    const level = parts[0];

    try {
      if (level === 'db') {
        const db = parts[1];
        const schemas = await explorerApi.getSchemas(db);
        const newChildren = schemas.map((schema: string) => {
          const isStandard = schema.toLowerCase() === 'dbo' || schema.toLowerCase() === 'em_protocol';
          return {
            title: schema,
            key: `schema|${db}|${schema}`,
            isLeaf: false,
            icon: <FolderOutlined style={{ color: isStandard ? '#1890ff' : 'inherit' }} />,
          };
        });
        updateTreeData(allTreeData, key, newChildren);
      } 
      else if (level === 'schema') {
        const db = parts[1];
        const schema = parts[2];
        const tables = await explorerApi.getTables(db, schema);
        const newChildren = tables.map((table: string) => ({
          title: table,
          key: `table|${db}|${schema}|${table}`,
          icon: <TableOutlined />,
        }));
        updateTreeData(allTreeData, key, newChildren);
      } 
      else if (level === 'table') {
        const db = parts[1];
        const schema = parts[2];
        const table = parts[3];
        const cols = await explorerApi.getColumns(db, schema, table);
        const newChildren = cols.map((col: { name: string; isTimeColumn: boolean }) => ({
          title: col.name,
          key: `col|${db}|${schema}|${table}|${col.name}|${col.isTimeColumn ? 'time' : 'other'}`,
          isLeaf: true,
          icon: col.isTimeColumn 
            ? <FieldTimeOutlined style={{ color: '#52c41a' }} />
            : <TableOutlined style={{ color: '#bfbfbf' }} />,
        }));
        if (newChildren.length === 0) {
           newChildren.push({
             title: <Text type="secondary" style={{ fontSize: 12 }}>Нет полей</Text>,
             key: `empty|${db}|${schema}|${table}`,
             isLeaf: true
           });
        }
        updateTreeData(allTreeData, key, newChildren);
      }
    } catch (e) {
      message.error('Ошибка загрузки данных узла');
    }
  };

  const updateTreeData = (list: DataNode[], key: React.Key, children: DataNode[]): DataNode[] => {
    const newList = list.map((node) => {
      if (node.key === key) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeData(node.children, key, children) };
      }
      return node;
    });
    setAllTreeData(newList);
    return newList;
  };

  const filteredTreeData = useMemo(() => {
    if (!searchTerm) return allTreeData;
    return allTreeData.filter(node => {
       if (typeof node.key === 'string' && node.key.startsWith('db|')) {
           const titleStr = typeof node.title === 'string' ? node.title : (node.title as any)?.props?.children || node.key;
           return String(titleStr).toLowerCase().includes(searchTerm.toLowerCase());
       }
       return true;
    });
  }, [allTreeData, searchTerm]);

  const onSelect = (selectedKeys: React.Key[], _info: any) => {
    if (selectedKeys.length === 0) return;
    
    const key = selectedKeys[0] as string;
    const parts = key.split('|');
    const level = parts[0];

    if (level === 'schema') {
      const db = parts[1];
      const schema = parts[2];
      if (schema.toLowerCase() === 'dbo' || schema.toLowerCase() === 'em_protocol') {
        onSelectStandardSchema(db, schema.toLowerCase());
      }
    } else if (level === 'col') {
      const colType = parts[5];
      if (colType === 'time') {
        onSelectGenericTable(parts[1], parts[2], parts[3], parts[4]);
      } else {
        message.info('Пожалуйста, выберите поле с типом дата/время (отмечено зеленым значком) для анализа.');
      }
    }
  };

  return (
    <div style={{ height: '100%', display: collapsed ? 'none' : 'flex', flexDirection: 'column', background: '#FFF', padding: '24px 16px', gap: 20 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A2332' }}>
          Источники данных
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Выберите таблицу или схему для анализа
        </Typography.Text>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          placeholder="Поиск БД..."
          prefix={<SearchOutlined style={{ color: '#A3AED0' }} />}
          allowClear
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ borderRadius: 10, background: '#F4F7FE', border: 'none', height: 38, flex: 1 }}
        />
        <Button type="text" icon={<LogoutOutlined />} onClick={onLogout} title="Отключиться" style={{ color: '#7A8B9E' }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Spin spinning={loading}>
          <Tree
            loadData={onLoadData}
            treeData={filteredTreeData}
            onSelect={onSelect}
            showIcon
            style={{ background: 'transparent' }}
            titleRender={(nodeData: any) => (
              <div style={{ whiteSpace: 'normal', wordBreak: 'break-all', display: 'inline-block', verticalAlign: 'middle', maxWidth: '220px' }}>
                {nodeData.title}
              </div>
            )}
          />
        </Spin>
      </div>
    </div>
  );
};
