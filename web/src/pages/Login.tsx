import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../utils/api';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    
    if (code && state) {
      setLoading(true);
      const redirectUri = window.location.origin + '/login';
      api.githubCallback(code, redirectUri)
        .then(({ token, user }) => {
          login(token, user);
          navigate('/');
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
      
      // Clean URL
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const { url } = await api.getGithubAuthUrl();
      window.location.href = url;
    } catch (e: any) {
      setError(e.message || 'Failed to initiate login');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔷</div>
        <h1 className="login-title">Token Usage Tracker</h1>
        <p className="login-desc">
          多厂商 AI Token 用量统计工具<br/>
          统一管理 OpenAI、Anthropic、DeepSeek 等平台的 API 消耗
        </p>
        
        {error && (
          <div style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        <button className="github-btn" onClick={handleLogin} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          {loading ? '连接中...' : '使用 GitHub 登录'}
        </button>

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
          登录即表示你同意使用 GitHub 账号进行身份验证<br/>
          数据将安全存储在你自己的 Cloudflare D1 数据库中
        </p>
      </div>
    </div>
  );
}
