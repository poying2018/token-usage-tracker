import React, { useState, useEffect, useCallback } from 'react';
import { api, getToken, UsageRecord, Vendor, vendorName, vendorColor, formatTokens, formatUsd, formatDateTime } from '../utils/api';

export default function Usage() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usageRes, vendorsRes] = await Promise.all([
        api.getUsage({ limit: 200, vendor: selectedVendor || undefined }),
        api.getVendors(),
      ]);
      setRecords(usageRes.records || []);
      setVendors(vendorsRes.vendors || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedVendor]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = (format: 'csv' | 'json') => {
    const url = api.exportUrl(format, 0);
    fetch(url, { headers: { Authorization: 'Bearer ' + getToken() } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'usage_export.' + format;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">用量明细</h1>
        <div className="header-actions">
          <select
            className="input"
            style={{ width: '160px' }}
            value={selectedVendor}
            onChange={e => setSelectedVendor(e.target.value)}
          >
            <option value="">全部厂商</option>
            {vendors.map(v => (
              <option key={v.vendor_id} value={v.vendor_id}>{v.display_name}</option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={() => handleExport('csv')}>
            导出 CSV
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => handleExport('json')}>
            导出 JSON
          </button>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 0, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>厂商</th>
                  <th>模型</th>
                  <th style={{ textAlign: 'right' }}>Prompt</th>
                  <th style={{ textAlign: 'right' }}>Completion</th>
                  <th style={{ textAlign: 'right' }}>总计</th>
                  <th style={{ textAlign: 'right' }}>费用</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      暂无记录
                    </td>
                  </tr>
                ) : (
                  records.map(record => (
                    <tr key={record.uuid}>
                      <td className="text-sm text-muted">{formatDateTime(record.created_at)}</td>
                      <td>
                        <span
                          className="vendor-badge"
                          style={{
                            background: vendorColor(record.vendor_id) + '22',
                            color: vendorColor(record.vendor_id),
                          }}
                        >
                          {vendorName(record.vendor_id)}
                        </span>
                      </td>
                      <td className="text-sm">{record.model}</td>
                      <td style={{ textAlign: 'right' }} className="text-sm">{formatTokens(record.prompt_tokens)}</td>
                      <td style={{ textAlign: 'right' }} className="text-sm">{formatTokens(record.completion_tokens)}</td>
                      <td style={{ textAlign: 'right' }} className="text-sm">{formatTokens(record.total_tokens)}</td>
                      <td style={{ textAlign: 'right' }} className="text-sm">{formatUsd(record.cost_usd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
