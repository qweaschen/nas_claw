import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function ConnectionPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('local'); // 'local' | 'remote'
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  const [webdavConfig, setWebdavConfig] = useState({
    url: '',
    username: '',
    password: '',
  });
  const [loaded, setLoaded] = useState(false);

  // Load saved WebDAV credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await window.electronAPI.loadSettings();
        if (settings.webdavUrl || settings.webdavUsername) {
          setWebdavConfig({
            url: settings.webdavUrl || '',
            username: settings.webdavUsername || '',
            password: settings.webdavPassword || '',
          });
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const handleConnectLocal = () => {
    // 清除旧的浏览/扫描数据，防止与上次的远程路径混淆
    sessionStorage.removeItem('browserPath');
    sessionStorage.removeItem('scanResults');
    sessionStorage.setItem('connectionMode', 'local');
    // Ensure WebDAV is disconnected just in case
    window.electronAPI.webdavDisconnect();
    navigate('/browser');
  };

  const handleConnectRemote = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.webdavConnect({
        url: webdavConfig.url,
        username: webdavConfig.username,
        password: webdavConfig.password
      });

      if (result.success) {
        // 清除旧的浏览/扫描数据，防止与上次的本地路径混淆
        sessionStorage.removeItem('browserPath');
        sessionStorage.removeItem('scanResults');
        sessionStorage.setItem('connectionMode', 'remote');
        sessionStorage.setItem('remoteHost', webdavConfig.url);

        // Save credentials to settings for next time
        try {
          const settings = await window.electronAPI.loadSettings();
          await window.electronAPI.saveSettings({
            ...settings,
            webdavUrl: webdavConfig.url,
            webdavUsername: webdavConfig.username,
            webdavPassword: webdavConfig.password,
          });
        } catch {}

        navigate('/browser');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>连接设备</h2>
        <p>选择要刮削的媒体文件所在的位置</p>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <button 
          className={mode === 'local' ? 'primary' : ''} 
          onClick={() => setMode('local')}
        >
          本地磁盘
        </button>
        <button 
          className={mode === 'remote' ? 'primary' : ''} 
          onClick={() => setMode('remote')}
        >
          WebDAV 远程 / NAS
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px' }}>
        {mode === 'local' ? (
          <div>
            <h3 style={{ marginBottom: '15px' }}>刮削本机文件</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
              如果你的整理好的电影文件存储在这个电脑上，或是通过 SMB/NFS 挂载到了本地，请选择此模式。
            </p>
            <button className="primary" onClick={handleConnectLocal} style={{ width: '100%' }}>
              开始访问本地文件
            </button>
          </div>
        ) : (
          <form onSubmit={handleConnectRemote}>
            <h3 style={{ marginBottom: '15px' }}>通过 WebDAV 连接 NAS</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              如果你的电影存在远程 NAS 上（群晖、Unraid等），可以通过 WebDAV 服务直接连接并在服务器上进行刮削。
            </p>
            
            <div className="form-group">
              <label>WebDAV 地址 (URL)</label>
              <input 
                type="text" 
                placeholder="例如: http://192.168.1.100:5005" 
                required
                value={webdavConfig.url}
                onChange={e => setWebdavConfig({...webdavConfig, url: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>用户名 (Username)</label>
              <input 
                type="text" 
                placeholder="留空则作为访客登录" 
                value={webdavConfig.username}
                onChange={e => setWebdavConfig({...webdavConfig, username: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>密码 (Password)</label>
              <input 
                type="password" 
                placeholder="请输入密码" 
                value={webdavConfig.password}
                onChange={e => setWebdavConfig({...webdavConfig, password: e.target.value})}
              />
            </div>

            {error && <p style={{ color: 'var(--danger)', marginBottom: '15px' }}>{error}</p>}

            <button type="submit" className="primary" style={{ width: '100%' }} disabled={connecting}>
              {connecting ? '正在连接...' : '连接到设备'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ConnectionPage;
