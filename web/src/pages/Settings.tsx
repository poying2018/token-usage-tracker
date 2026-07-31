import React, { useState, useEffect } from 'react';
import { api, getToken, getDeviceId, getDeviceName, formatDateTime } from '../utils/api';

interface DeviceInfo {
  device_id: string;
  device_name: string;
  last_seen_at: number;
  stale: boolean;
}

export default function Settings() {
  const [budget, setBudget] = useState<string>('');
  const [budgetSaved, setBudgetSaved] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [currentDeviceId] = useState(getDeviceId());
  const [currentDeviceName] = useState(getDeviceName());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const [budgetRes, devicesRes] = await Promise.all([
          api.getBudget(),
          api.getDevices(),
        ]);
        if (budgetRes.amount) setBudget(String(budgetRes.amount));
        setDevices(devicesRes.devices || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveBudget = async () => {
    setBudgetSaved(false);
    try {
      const amount = parseFloat(budget);
      if (isNaN(amount) || amount < 0) return;
      await api.setBudget(amount, 'USD');
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportAll = () => {
    const url = api.exportUrl('json', 0);
    fetch(url, { headers: { Authorization: 'Bearer ' + getToken() } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'usage_all.json';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  };

  const handleClearLocalData = () => {
    if (window.confirm('确定要清除所有本地缓存数据吗？此操作不可撤销。')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">设置</h1>
      </div>

      <div className="chart-card">
        <div className="chart-title">月度预算</div>
        <div className="flex gap-2 items-center" style={{ maxWidth: '360px' }}>
          <div style={{ flex: 1 }}>
            <label className="stat-label">预算金额 (USD/月)</label>
            <input
              className="input mt-4"
              type="number"
              min="0"
              step="1"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="例如: 50"
            />
          </div>
          <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={handleSaveBudget}>
            保存
          </button>
        </div>
        {budgetSaved && <div style={{ color: 'var(--success)', fontSize: '13px', marginTop: '8px' }}>预算已保存</div>}
      </div>

      <div className="chart-card">
        <div className="chart-title">同步状态</div>
        <div className="flex gap-3 items-center">
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)' }} />
          <span className="text-sm">所有数据已同步至服务器</span>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">设备信息</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>设备 ID</th>
              <th>设备名称</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-sm text-muted">{currentDeviceId}</td>
              <td className="text-sm">{currentDeviceName}</td>
              <td>
                <span className="vendor-badge" style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
                  当前设备
                </span>
              </td>
            </tr>
            {devices.filter(d => d.device_id !== currentDeviceId).map(device => (
              <tr key={device.device_id}>
                <td className="text-sm text-muted">{device.device_id}</td>
                <td className="text-sm">{device.device_name}</td>
                <td>
                  <span className="vendor-badge" style={{ background: device.stale ? 'rgba(100,116,139,0.2)' : 'rgba(52,211,153,0.15)', color: device.stale ? '#94A3B8' : '#34D399' }}>
                    {device.stale ? '离线' : '在线'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-card">
        <div className="chart-title">数据管理</div>
        <div className="flex gap-3">
          <button className="btn btn-outline" onClick={handleExportAll}>
            导出全部数据
          </button>
          <button className="btn btn-danger" onClick={handleClearLocalData}>
            清除本地数据
          </button>
        </div>
        <div className="text-sm text-muted mt-4">
          导出功能将下载完整的使用记录，清除本地数据会移除所有缓存并重新从服务器获取。
        </div>
      </div>
    </div>
  );
}
