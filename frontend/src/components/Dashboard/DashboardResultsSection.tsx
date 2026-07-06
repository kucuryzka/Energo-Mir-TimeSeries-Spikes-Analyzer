import React from 'react';
import { Row, Col } from 'antd';
import type { AnomalyResultDto, SpikePoint } from '../../types/analytics.types';
import { DashboardKpiGrid, type DashboardStats } from './DashboardKpiGrid';
import { CriticalityDonut } from './CriticalityDonut';
import { SpikeChart } from '../Chart/SpikeChart';
import { SpikeTable } from '../Stats/SpikeTable';
import { AnalysisJobProgress } from './AnalysisJobProgress';

interface DashboardResultsSectionProps {
  stats: DashboardStats;
  enrichedData: SpikePoint[];
  spikesOnly: AnomalyResultDto[];
  showMarkers: boolean;
  onShowMarkersChange: (value: boolean) => void;
  onPointClick: (point: SpikePoint) => void;
  entityLabel?: string;
  averageDecimals?: number;
  maxDecimals?: number;
  loading?: boolean;
  analysisProgress?: number;
  isPartialResult?: boolean;
  distributionCharts?: React.ReactNode;
}

export const DashboardResultsSection: React.FC<DashboardResultsSectionProps> = ({
  stats,
  enrichedData,
  spikesOnly,
  showMarkers,
  onShowMarkersChange,
  onPointClick,
  entityLabel,
  averageDecimals,
  maxDecimals,
  loading,
  analysisProgress,
  isPartialResult,
  distributionCharts,
}) => {
  const warningCount = Math.max(0, stats.spikesCount - stats.criticalSpikes);

  return (
    <>
      <AnalysisJobProgress
        loading={!!loading}
        progress={analysisProgress ?? 0}
        isPartialResult={isPartialResult}
      />

      <DashboardKpiGrid stats={stats} averageDecimals={averageDecimals} maxDecimals={maxDecimals} />

      <div
        className="dashboard-block"
        style={{
          backgroundColor: '#F8F9FE',
          border: '1px solid #E9EEFA',
          padding: '24px 24px 32px',
          marginBottom: 24,
          borderRadius: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#1A2332', marginRight: 8 }}>График</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#1A2332' }}>показателей</span>
        </div>

        <SpikeChart
          data={enrichedData}
          showMarkers={showMarkers}
          onShowMarkersChange={onShowMarkersChange}
          onPointClick={onPointClick}
        />
      </div>

      {spikesOnly.length > 0 && (
        <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={8}>
            <CriticalityDonut criticalCount={stats.criticalSpikes} warningCount={warningCount} />
          </Col>
          <Col xs={24} lg={16}>
            <div className="dashboard-block" style={{ minHeight: 460, padding: 24 }}>
              <SpikeTable spikes={spikesOnly} entityLabel={entityLabel} />
            </div>
          </Col>
        </Row>
      )}

      {distributionCharts}
    </>
  );
};
