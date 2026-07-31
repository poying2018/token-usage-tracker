import React, { useState, useEffect } from 'react';
import { api, Vendor, vendorColor, vendorName } from '../utils/api';

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({ display_name: '', api_base_url: '', pricing: '{}' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await api.getVendors();
      setVendors(res.vendors || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const openAddModal = () => {
    setEditingVendor(null);
    setFormData({ display_name: '', api_base_url: '', pricing: '{\n  "model-name": { "input": 0, "output": 0 }\n}' });
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      display_name: vendor.display_name,
      api_base_url: vendor.api_base_url,
      pricing: JSON.stringify(vendor.pricing, null, 2),
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const pricingObj = JSON.parse(formData.pricing);
      const data = {
        vendor_id: editingVendor?.vendor_id || formData.display_name.toLowerCase().replace(/\s+/g, '_'),
        display_name: formData.display_name,
        api_base_url: formData.api_base_url,
        pricing: pricingObj,
      };
      await api.updateVendor(data);
      setShowModal(false);
      await fetchVendors();
    } catch (err: any) {
      setError(err.message || '保存失败，请检查输入格式');
    } finally {
      setSaving(false);
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
        <h1 className="page-title">厂商管理</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAddModal}>+ 添加厂商</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {vendors.map(vendor => (
          <div key={vendor.vendor_id} className="chart-card" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => openEditModal(vendor)}>
            <div className="flex items-center gap-2 mb-4">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: vendorColor(vendor.vendor_id) }} />
              <strong>{vendor.display_name}</strong>
            </div>
            <div className="text-sm text-muted mb-4" style={{ wordBreak: 'break-all' }}>
              {vendor.api_base_url || '—'}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th style={{ textAlign: 'right' }}>输入 / 1K</th>
                  <th style={{ textAlign: 'right' }}>输出 / 1K</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(vendor.pricing).map(([model, price]) => (
                  <tr key={model}>
                    <td className="text-sm">{model}</td>
                    <td style={{ textAlign: 'right' }} className="text-sm text-muted">${price.input.toFixed(4)}</td>
                    <td style={{ textAlign: 'right' }} className="text-sm text-muted">${price.output.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="chart-card" style={{ width: '480px', maxWidth: '90vw' }}>
            <div className="chart-title">{editingVendor ? '编辑厂商' : '添加厂商'}</div>
            {error && <div style={{ color: 'var(--error)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
            <div style={{ marginBottom: '12px' }}>
              <label className="stat-label">显示名称</label>
              <input
                className="input mt-4"
                value={formData.display_name}
                onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="例如: OpenAI"
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label className="stat-label">API Base URL</label>
              <input
                className="input mt-4"
                value={formData.api_base_url}
                onChange={e => setFormData({ ...formData, api_base_url: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="stat-label">定价 JSON</label>
              <textarea
                className="input mt-4"
                style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                value={formData.pricing}
                onChange={e => setFormData({ ...formData, pricing: e.target.value })}
                placeholder='{"model-name": {"input": 0.01, "output": 0.03}}'
              />
            </div>
            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
