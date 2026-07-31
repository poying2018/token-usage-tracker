import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { api, StatsData, formatTokens, formatUsd, formatCny, vendorColor, vendorName } from '../utils/api';

export default function Dashboard() {
  const [period, setPeriod] = useState<'today' | 'month' | 'last30days'>('today');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getStats(period)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading && !stats) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const s = stats || { totalTokens: 0, costUsd: 0, callCount: 0, vendors: {}, models: {}, devices: [], daily: [] };

  const trendOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1E293B',
      borderColor: '#334155',
      textStyle: { color: '#E2E8F0' },
    },
    grid: { left: 60, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: s.daily.map((d: any) => d.date),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94A3B8' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(51,65,85,0.5)' } },
      axisLabel: { color: '#94A3B8', formatter: (v: number) => formatTokens(v) },
    },
    series: [{
      type: 'line',
      smooth: true,
      data: s.daily.map((d: any) => d.totalTokens),
      lineStyle: { color: '#6366F1', width: 3 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(99,102,241,0.3)' },
            { offset: 1, color: 'rgba(99,102,241,0)' },
          ],
        },
      },
      itemStyle: { color: '#6366F1' },
    }],
  };

  const vendorOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1E293B',
      borderColor: '#334155',
      textStyle: { color: '#E2E8F0' },
      formatter: '{b}: {c} tokens ({d}%)',
    },
    legend: { bottom: 0, textStyle: { color: '#94A3B8' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      data: Object.entries(s.vendors).map(([id, v]) => ({
        name: vendorName(id),
        value: (v as any).totalTokens,
        itemStyle: { color: vendorColor(id) },
      })),
      label: { color: '#E2E8F0', formatter: '{b}\n{d}%' },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
      },
    }],
  };

  const sortedModels = Object.entries(s.models).sort((a, b) => (b[1] as any).totalTokens - (a[1] as any).totalTokens).slice(0, 8);
  const modelOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1E293B',
      borderColor: '#334155',
      textStyle: { color: '#E2E8F0' },
    },
    grid: { left: 120, right: 40, top: 10, bottom: 20 },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(51,65,85,0.5)' } },
      axisLabel: { color: '#94A3B8' },
    },
    yAxis: {
      type: 'category',
      data: sortedModels.map(([name]) => name),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94A3B8', fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: sortedModels.map(([_, v]) => (v as any).totalTokens),
      itemStyle: { color: '#818CF8', borderRadius: [0, 4, 4, 0] },
      barWidth: 16,
    }],
  };

  const tabClass = (p: string) => 'tab' + (period === p ? ' active' : '');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">概览</h1>
        <div className="header-actions">
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={tabClass('today')} onClick={() => setPeriod('today')}>今日</button>
            <button className={tabClass('month')} onClick={() => setPeriod('month')}>本月</button>
            <button className={tabClass('last30days')} onClick={() => setPeriod('last30days')}>近30天</button>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Tokens</div>
          <div className="stat-value">{formatTokens(s.totalTokens)}</div>
          <div className="stat-sub">累计消耗</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Estimated Cost</div>
          <div className="stat-value">{formatUsd(s.costUsd)}</div>
          <div className="stat-sub">≈ {formatCny(s.costUsd)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">API Calls</div>
          <div className="stat-value">{s.callCount.toLocaleString()}</div>
          <div className="stat-sub">调用次数</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Devices</div>
          <div className="stat-value">{s.devices.filter(d => !d.stale).length}/{s.devices.length}</div>
          <div className="stat-sub">在线设备</div>
        </div>
      </div>

      {s.daily.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">每日 Token 趋势</div>
          <div className="chart-container">
            <ReactECharts option={trendOption} style={{ height: '100%' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {Object.keys(s.vendors).length > 0 && (
          <div className="chart-card" style={{ marginBottom: 0 }}>
            <div className="chart-title">按厂商分布</div>
            <div className="chart-container">
              <ReactECharts option={vendorOption} style={{ height: '100%' }} />
            </div>
          </div>
        )}
        {Object.keys(s.models).length > 0 && (
          <div className="chart-card" style={{ marginBottom: 0 }}>
            <div className="chart-title">按模型分布 (Top 8)</div>
            <div className="chart-container">
              <ReactECharts option={modelOption} style={{ height: '100%' }} />
            </div>
          </div>
        )}
      </div>

      {s.devices.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">设备状态</div>
          <table className="data-table">
            <thead>
              <tr><th>设备</th><th>最后活跃</th><th>状态</th></tr>
            </thead>
            <tbody>
              {s.devices.map(d => (
                <tr key={d.device_id}>
                  <td>{d.device_name}</td>
                  <td className="text-muted">{new Date(d.last_seen_at).toLocaleString('zh-CN')}</td>
                  <td>
                    <span className="vendor-badge" style={{ background: d.stale ? 'rgba(100,116,139,0.2)' : 'rgba(52,211,153,0.15)', color: d.stale ? '#94A3B8' : '#34D399' }}>
                      {d.stale ? '离线' : '在线'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
