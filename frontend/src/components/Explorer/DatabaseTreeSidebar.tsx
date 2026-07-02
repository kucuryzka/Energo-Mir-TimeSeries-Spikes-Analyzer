import React, { useState, useEffect, useMemo } from 'react';
import { Tree, message, Spin, Typography, Button, Input } from 'antd';
import { DatabaseOutlined, FolderOutlined, TableOutlined, FieldTimeOutlined, LogoutOutlined, MenuFoldOutlined, BarsOutlined } from '@ant-design/icons';
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
  onToggleCollapse,
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
            : <BarsOutlined style={{ color: '#bfbfbf' }} />,
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
    <div style={{ height: '100%', display: collapsed ? 'none' : 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #f0f0f0' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Обозреватель</Text>
        <div>
          <Button type="text" icon={<MenuFoldOutlined />} onClick={onToggleCollapse} title="Свернуть" />
          <Button type="text" icon={<LogoutOutlined />} onClick={onLogout} title="Отключиться" />
        </div>
      </div>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Input.Search 
          placeholder="Поиск БД..." 
          allowClear
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        <Spin spinning={loading}>
          <Tree
            loadData={onLoadData}
            treeData={filteredTreeData}
            onSelect={onSelect}
            showIcon
            titleRender={(nodeData: any) => (
              <div style={{ whiteSpace: 'normal', wordBreak: 'break-all', display: 'inline-block', verticalAlign: 'middle', maxWidth: '200px' }}>
                {nodeData.title}
              </div>
            )}
          />
        </Spin>
      </div>
    </div>
  );
};
