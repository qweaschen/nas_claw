import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function BrowserPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('local');
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanProgress, setScanProgress] = useState(null);

  useEffect(() => {
    const connMode = sessionStorage.getItem('connectionMode') || 'local';
    setMode(connMode);
    
    // Restore last browsed path and items if available
    const savedPath = sessionStorage.getItem('browserPath');
    const savedItems = sessionStorage.getItem('browserItems');
    
    if (savedPath && savedItems) {
      try {
        setCurrentPath(savedPath);
        setItems(JSON.parse(savedItems));
        return; // Already has cached state, no need to reload
      } catch {}
    }
    
    if (connMode === 'remote') {
      loadDir('/', true);
    }
  }, []);

  useEffect(() => {
    const unbind = window.electronAPI.onScanProgress((data) => {
      setScanProgress(data);
      setScanStatus(`正在扫描：${data.currentPath || '...'}`);
    });
    return () => unbind();
  }, []);

  const loadDir = async (dirPath, isRemote) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.listDir(dirPath, isRemote);
      if (result.success) {
        setItems(result.items);
        setCurrentPath(dirPath);
        // Persist for page re-entry
        sessionStorage.setItem('browserPath', dirPath);
        sessionStorage.setItem('browserItems', JSON.stringify(result.items));
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChooseLocalDir = async () => {
    const dir = await window.electronAPI.openDirectory();
    if (dir) {
      loadDir(dir, false);
    }
  };

  const handleItemClick = (item) => {
    if (item.isDirectory) {
      loadDir(item.path, mode === 'remote');
    }
  };

  const navigateUp = () => {
    if (!currentPath || currentPath === '/') return;
    let upPath;
    if (mode === 'remote') {
      const parts = currentPath.replace(/\/+$/, '').split('/');
      parts.pop();
      upPath = parts.join('/') || '/';
    } else {
      const trimmed = currentPath.replace(/[\/\\]+$/, '');
      const sep = currentPath.includes('\\') ? '\\' : '/';
      const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      if (lastSlash <= 0) return;
      upPath = trimmed.slice(0, lastSlash) || sep;
      if (/^[A-Za-z]:$/.test(upPath)) upPath += sep;
    }
    loadDir(upPath, mode === 'remote');
  };

  const startScan = async () => {
    if (!currentPath) {
      alert("请先选择一个目录");
      return;
    }

    setScanning(true);
    setScanStatus('正在扫描目录...');
    setScanProgress({ directories: 0, files: 0, videos: 0, currentPath });
    setSelectedVideos([]);
    try {
      // 构建排除目录列表，排除"整理完成"文件夹，避免重复扫描已刮削的视频
      const sep = mode === 'remote' ? '/' : (currentPath.includes('\\') ? '\\' : '/');
      const excludeDirs = [currentPath.replace(/[\/\\]$/, '') + sep + '整理完成'];

      let result;
      if (mode === 'remote') {
        result = await window.electronAPI.scanRemote(currentPath, excludeDirs);
      } else {
        result = await window.electronAPI.scanLocal(currentPath, excludeDirs);
      }

      if (result.success) {
        setSelectedVideos(result.files);
        setScanStatus(`扫描完成，找到 ${result.files.length} 个视频`);
      } else if (result.canceled) {
        setSelectedVideos(result.files || []);
        setScanStatus(`扫描已取消，保留已找到的 ${result.files?.length || 0} 个视频`);
      } else {
        setScanStatus('');
        alert("扫描失败: " + result.error);
      }
    } catch (err) {
      setScanStatus('');
      alert("扫描报错: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  const cancelScan = async () => {
    if (!scanning) return;
    setScanStatus('正在取消扫描...');
    await window.electronAPI.cancelScan();
  };

  const proceedToScrape = () => {
    if (selectedVideos.length === 0) return;
    // We can store videos via sessionStorage since it's just JS objects within the same window
    sessionStorage.setItem('scanResults', JSON.stringify(selectedVideos));
    navigate('/scrape');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: '15px' }}>
        <h2>文件浏览 ({mode === 'local' ? '本地' : '远程 NAS'})</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>当前路径: {currentPath || '未选择'}</span>
          {mode === 'local' && (
            <button onClick={handleChooseLocalDir}>浏览本机...</button>
          )}
          <button className="primary" onClick={startScan} disabled={scanning || !currentPath}>
            {scanning ? '正在扫描...' : '扫描当前目录下视频文件'}
          </button>
          {scanning && (
            <button onClick={cancelScan} className="danger">
              取消扫描
            </button>
          )}
        </div>
        {(scanStatus || scanProgress) && (
          <div className="scan-progress-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <p className="scan-status">{scanStatus}</p>
              {scanProgress && (
                <div className="scan-stats">
                  <span>目录 {scanProgress.directories || 0}</span>
                  <span>文件 {scanProgress.files || 0}</span>
                  <span>视频 {scanProgress.videos || 0}</span>
                </div>
              )}
            </div>
            {scanning && (
              <div className="scan-progress-track">
                <div className="scan-progress-bar"></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="browser-layout" style={{ flex: 1 }}>
        {/* Left: Directory Tree / File Explorer */}
        <div className="glass-panel dir-tree" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '10px' }}>
            <button onClick={navigateUp} style={{ padding: '4px 8px' }}>返回上级</button>
          </div>
          
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <p>加载中...</p>}
            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
            {!loading && !error && items.map((item, idx) => (
              <div 
                key={idx} 
                className="list-item" 
                onClick={() => handleItemClick(item)}
              >
                <div className="icon">{item.isDirectory ? 'DIR' : 'FILE'}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Scan Results */}
        <div className="glass-panel file-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0 }}>扫描结果 ({selectedVideos.length} 个视频)</h3>
            <button 
              className="primary" 
              onClick={proceedToScrape} 
              disabled={selectedVideos.length === 0}
            >
              下一步：开始刮削
            </button>
          </div>

          {selectedVideos.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '50px' }}>
              点击左上角扫描按钮开始寻找视频文件
            </div>
          ) : (
            <table className="table-container">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>识别番号</th>
                  <th>类型</th>
                  <th>大小</th>
                </tr>
              </thead>
              <tbody>
                {selectedVideos.map((video, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {video.name}
                      </div>
                    </td>
                    <td>
                      {video.avid ? (
                        <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{video.avid}</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>未能识别</span>
                      )}
                    </td>
                    <td>{video.avidType || '-'}</td>
                    <td>{(video.size / 1024 / 1024).toFixed(1)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default BrowserPage;
