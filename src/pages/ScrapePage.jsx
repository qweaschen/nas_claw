import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import scrapeStore from '../stores/scrapeStore';

function ScrapePage() {
  const navigate = useNavigate();

  // 从 store 恢复状态（如果有）
  const stored = scrapeStore.getState();
  const [videos, setVideos] = useState([]);
  const [results, setResults] = useState(stored.results);
  const [progress, setProgress] = useState(stored.progress);
  const [overallProgress, setOverallProgress] = useState(stored.overallProgress);
  const [scraping, setScraping] = useState(stored.scraping);
  const [paused, setPaused] = useState(stored.paused);
  const [scrapeLog, setScrapeLog] = useState(stored.scrapeLog);
  const [coverSources, setCoverSources] = useState({});
  const [coverErrors, setCoverErrors] = useState({});
  const [outputDir, setOutputDir] = useState(() => {
    // 优先从 store 恢复
    if (stored.outputDir) return stored.outputDir;
    const browsedPath = sessionStorage.getItem('browserPath') || '';
    if (browsedPath) {
      const connMode = sessionStorage.getItem('connectionMode') || 'local';
      const sep = connMode === 'remote' ? '/' : (browsedPath.includes('\\') ? '\\' : '/');
      return browsedPath.replace(/[\/\\]$/, '') + sep + '整理完成';
    }
    return '';
  });
  
  // Edit Modal State
  const [editingAvid, setEditingAvid] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const logEndRef = useRef(null);

  // 用 ref 追踪最新状态，方便在 IPC 回调中同步到 store
  const resultsRef = useRef(results);
  const progressRef = useRef(progress);
  const overallRef = useRef(overallProgress);
  const scrapingRef = useRef(scraping);
  const pausedRef = useRef(paused);
  const logRef = useRef(scrapeLog);

  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { overallRef.current = overallProgress; }, [overallProgress]);
  useEffect(() => { scrapingRef.current = scraping; }, [scraping]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { logRef.current = scrapeLog; }, [scrapeLog]);

  // 同步状态到 store（组件卸载时保存）
  useEffect(() => {
    return () => {
      scrapeStore.save({
        results: resultsRef.current,
        progress: progressRef.current,
        overallProgress: overallRef.current,
        scraping: scrapingRef.current,
        paused: pausedRef.current,
        scrapeLog: logRef.current,
        outputDir,
      });
    };
  }, [outputDir]);

  useEffect(() => {
    let canceled = false;

    Object.entries(results).forEach(([avid, res]) => {
      const cover = res?.success ? (res.data?.coverLocalPath || res.data?.cover) : '';
      if (!cover || coverSources[avid]) return;

      const normalizedCover = normalizeImageUrl(cover);
      setCoverSources(prev => ({ ...prev, [avid]: normalizedCover }));

      if (!window.electronAPI.fetchImageDataUrl) return;

      window.electronAPI.fetchImageDataUrl(normalizedCover).then(result => {
        if (canceled) return;
        if (result?.success && result.dataUrl) {
          setCoverSources(prev => ({ ...prev, [avid]: result.dataUrl }));
          setCoverErrors(prev => {
            if (!prev[avid]) return prev;
            const updated = { ...prev };
            delete updated[avid];
            return updated;
          });
        } else {
          setCoverErrors(prev => ({ ...prev, [avid]: true }));
        }
      });
    });

    return () => {
      canceled = true;
    };
  }, [results, coverSources]);

  useEffect(() => {
    // Load videos from sessionStorage
    const storedVideos = sessionStorage.getItem('scanResults');
    if (storedVideos) {
      try {
        const parsed = JSON.parse(storedVideos);
        setVideos(parsed.filter(v => v.avid)); // Only videos with recognized ID
      } catch {}
    }

    // Set up progress listeners
    const unbindBatch = window.electronAPI.onBatchProgress((data) => {
      const newOverall = { current: data.current, total: data.total, file: data.file || '' };
      setOverallProgress(newOverall);
      setScrapeLog(prev => [...prev, `[${data.current}/${data.total}] 开始处理: ${data.file}`]);
      // 同步到 store
      scrapeStore.overallProgress = newOverall;
    });

    const unbindSingle = window.electronAPI.onScrapeProgress((data) => {
      setProgress(prev => {
        const updated = { ...prev, [data.avid]: { step: data.step, percent: data.progress } };
        scrapeStore.progress = updated;
        return updated;
      });
      setScrapeLog(prev => [...prev, `  [${data.avid}] ${data.step}`]);
    });

    // Listen for per-item results to update cards in real-time
    const unbindItemResult = window.electronAPI.onItemResult((data) => {
      if (data.success && data.data?.cover) {
        setCoverSources(prev => {
          if (!prev[data.avid]) return prev;
          const updated = { ...prev };
          delete updated[data.avid];
          return updated;
        });
        setCoverErrors(prev => {
          if (!prev[data.avid]) return prev;
          const updated = { ...prev };
          delete updated[data.avid];
          return updated;
        });
      }
      setResults(prev => {
        const updated = {
          ...prev,
          [data.avid]: {
            success: data.success,
            data: data.data,
            error: data.error,
            file: data.file,
            saved: data.saved || false,
          }
        };
        // 实时同步到 store，这样即使切走页面再回来也能看到
        scrapeStore.results = updated;
        return updated;
      });
    });

    return () => {
      unbindBatch();
      unbindSingle();
      unbindItemResult();
    };
  }, []);

  const startBatchScrape = async () => {
    if (videos.length === 0) return;
    
    // 重置 store 和状态
    scrapeStore.reset();
    setScraping(true);
    scrapeStore.scraping = true;
    setOverallProgress({ current: 0, total: videos.length, file: '' });
    setProgress({});
    setResults({});
    setCoverSources({});
    setCoverErrors({});
    setScrapeLog(['━━━ 开始批量刮削 (共 ' + videos.length + ' 个视频) ━━━']);

    try {
      const settings = await window.electronAPI.loadSettings();
      const connMode = sessionStorage.getItem('connectionMode') || 'local';
      const isRemote = connMode === 'remote';
      const scanRoot = sessionStorage.getItem('browserPath') || '';
      const options = {
        priority: settings.scraperPriority || ['fc2official', 'fc2av123', 'jav321', 'javdb', 'javbus', 'missav'],
        proxy: settings.proxy || null,
        outputDir: outputDir || null,
        isRemote,
        scanRoot, // 扫描根目录，用于清理残留文件时限制范围
        organizeMode: settings.organizeMode || 'avid', // 整理模式
        createNFO: settings.createNFO !== false,
        downloadCover: settings.downloadCover !== false,
        downloadFanart: settings.downloadFanart !== false,
      };

      const scanRes = await window.electronAPI.scrapeBatch(videos, options);
      
      const newResults = {};
      for (const res of scanRes) {
        newResults[res.file.avid] = {
          success: res.success,
          data: res.data,
          error: res.error,
          file: res.file,
          saved: res.saved || false,
        };
      }
      setResults(newResults);
      scrapeStore.results = newResults;

    } catch (err) {
      alert("批量刮削失败: " + err.message);
    } finally {
      setScraping(false);
      setPaused(false);
      scrapeStore.scraping = false;
      scrapeStore.paused = false;
      setScrapeLog(prev => [...prev, '━━━ 刮削完成 ━━━']);
    }
  };

  const handlePauseResume = async () => {
    if (paused) {
      await window.electronAPI.scrapeResume();
      setPaused(false);
      setScrapeLog(prev => [...prev, '已恢复刮削']);
    } else {
      await window.electronAPI.scrapePause();
      setPaused(true);
      setScrapeLog(prev => [...prev, '已暂停刮削']);
    }
  };

  const handleStop = async () => {
    await window.electronAPI.scrapeStop();
    setScraping(false);
    setPaused(false);
    setScrapeLog(prev => [...prev, '已停止刮削']);
  };

  const handleSaveResult = async (avid) => {
    const res = results[avid];
    if (!res || !res.success || !res.data) return;

    const isRemote = sessionStorage.getItem('connectionMode') === 'remote';
    
    try {
      const saveRes = await window.electronAPI.saveScrapeResult(
        res.file, 
        res.data, 
        null, // Use file's directory by default
        isRemote
      );

      if (saveRes.success) {
        setResults(prev => ({
          ...prev,
          [avid]: { ...prev[avid], saved: true }
        }));
      } else {
        alert(`保存 ${avid} 失败: ` + saveRes.error);
      }
    } catch (err) {
      alert(`保存 ${avid} 报错: ` + err.message);
    }
  };

  const saveAllSuccessful = async () => {
    const successfulAvids = Object.keys(results).filter(avid => 
      results[avid].success && !results[avid].saved
    );

    for (const avid of successfulAvids) {
      await handleSaveResult(avid);
    }
  };

  const openEditor = (avid) => {
    setEditingAvid(avid);
    setEditFormData({ ...results[avid].data });
  };

  const saveEditedData = () => {
    setResults(prev => {
      const updated = {
        ...prev,
        [editingAvid]: {
          ...prev[editingAvid],
          data: editFormData
        }
      };
      scrapeStore.results = updated;
      return updated;
    });
    setEditingAvid(null);
  };

  const normalizeImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <h2>刮削任务</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>待刮削视频: {videos.length} 个</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {!scraping ? (
              <button className="primary" onClick={startBatchScrape} disabled={videos.length === 0 || !outputDir}>
                开始批量刮削
              </button>
            ) : (
              <>
                <button onClick={handlePauseResume} style={{ minWidth: '100px' }}>
                  {paused ? '继续' : '暂停'}
                </button>
                <button onClick={handleStop} className="danger">
                  停止
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Output Directory Selector */}
      <div className="glass-panel toolbar-panel">
        <span className="toolbar-label">整理输出目录</span>
        {(sessionStorage.getItem('connectionMode') || 'local') === 'local' ? (
          <>
            <input
              className="path-field"
              type="text"
              placeholder="选择整理完成后存放的文件夹"
              value={outputDir}
              readOnly
              style={{ flex: 1 }}
            />
            <button onClick={async () => {
              const dir = await window.electronAPI.openDirectory();
              if (dir) setOutputDir(dir);
            }}>浏览...</button>
          </>
        ) : (
          <input
            className="path-field"
            type="text"
            placeholder="例如: /volume1/整理完成"
            value={outputDir}
            onChange={e => setOutputDir(e.target.value)}
            style={{ flex: 1 }}
          />
        )}
        {!outputDir && <span style={{ color: 'var(--danger)', fontSize: '12px', whiteSpace: 'nowrap' }}>⚠ 必须设置后才能开始</span>}
      </div>

      {(scraping || scrapeLog.length > 0 || overallProgress.total > 0) && (
        <div className="glass-panel progress-panel">
          {overallProgress.total > 0 && (
            <>
              <div className="progress-heading">
                <h4>总进度: {overallProgress.current} / {overallProgress.total}{!scraping && overallProgress.current >= overallProgress.total ? ' · 全部完成' : ''}</h4>
                {scraping && <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>当前: {overallProgress.file}</span>}
              </div>
              <div className="progress-container" style={{ height: '10px', marginBottom: '15px' }}>
                <div 
                  className="progress-bar" 
                  style={{ width: ((overallProgress.current / overallProgress.total) * 100) + '%' }}
                ></div>
              </div>
            </>
          )}
          <div className="log-console">
            {scrapeLog.map((log, i) => (
              <div key={i} style={{ 
                color: log.includes('━') ? '#d7a15b' : 
                       log.includes('成功') ? '#87c89c' : 
                       log.includes('失败') ? '#ff9b93' : 
                       log.includes('开始处理') ? '#fff7ea' : 'rgba(247, 241, 231, 0.72)'
              }}>{log}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Results List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {videos.map(video => {
          const avid = video.avid;
          const res = results[avid];
          const currProgress = progress[avid];
          const cardState = res ? (res.success ? 'is-success' : 'is-error') : (currProgress ? 'is-active' : '');

          return (
            <div key={avid} className={`glass-panel movie-card fade-in ${cardState}`} style={{ opacity: (!res && !currProgress) ? 0.72 : 1 }}>
              {/* Cover Image Block */}
              <div style={{ width: '118px', minHeight: '168px', position: 'relative', overflow: 'hidden', borderRadius: '6px', background: 'var(--bg-secondary)', flexShrink: 0 }}>
                {res && res.success && (res.data.coverLocalPath || res.data.cover) && !coverErrors[avid] ? (
                  <img 
                    key={res.data.coverLocalPath || res.data.cover}
                    src={coverSources[avid] || normalizeImageUrl(res.data.coverLocalPath || res.data.cover)}
                    alt="Cover" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => setCoverErrors(prev => ({ ...prev, [avid]: true }))}
                  />
                ) : res && res.success && (res.data.coverLocalPath || res.data.cover) && coverErrors[avid] ? (
                  <div className="cover-fallback">封面加载失败</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '168px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {currProgress ? '正在获取...' : '无封面'}
                  </div>
                )}
                
                {/* Status Badge Overlays */}
                <div style={{ position: 'absolute', top: '6px', right: '6px' }}>
                  {!res && !currProgress && <span className="status-badge status-pending">等待中</span>}
                  {scraping && currProgress && !res && <span className="status-badge" style={{ background: 'var(--accent)', color: 'white' }}>刮削中</span>}
                  {res && res.success && <span className="status-badge status-success">成功</span>}
                  {res && !res.success && <span className="status-badge status-error">失败</span>}
                </div>
              </div>

              {/* Info Block */}
              <div className="movie-info" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 className="movie-title">
                      {res && res.success ? res.data.title : video.name}
                    </h3>
                    <p style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      {avid} 
                      {res && res.success && res.data.score && (
                        <span style={{ color: '#F39C12', marginLeft: '8px', fontSize: '12px' }}>⭐ {res.data.score}</span>
                      )}
                    </p>
                  </div>
                  
                  {/* Action Buttons */}
                  {res && res.success && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => openEditor(avid)} style={{ padding: '4px 10px', fontSize: '12px' }}>✏️ 编辑</button>
                      <button 
                        className={res.saved ? "status-success" : "primary"}
                        onClick={() => handleSaveResult(avid)}
                        disabled={res.saved}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 'bold', fontSize: '12px' }}
                      >
                        {res.saved ? '已保存 NFO' : '保存 NFO'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Scraping Progress Indicator */}
                {currProgress && !res && (
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{currProgress.step}</p>
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: currProgress.percent + '%' }}></div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {res && !res.success && (
                  <div className="error-message">
                    <strong>错误:</strong> {res.error}
                  </div>
                )}

                {/* Metadata Details */}
                {res && res.success && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 10px', marginBottom: '8px', fontSize: '12px' }}>
                      <div><span style={{ color: 'var(--text-secondary)' }}>发行日期:</span> {res.data.publish_date || '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>时长:</span> {res.data.duration ? res.data.duration + '分钟' : '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>制造商:</span> {res.data.producer || '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>发行商:</span> {res.data.publisher || '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>导演:</span> {res.data.director || '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>系列:</span> {res.data.serial || '-'}</div>
                    </div>

                    <div style={{ marginBottom: '6px' }}>
                      <strong style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>演员:</strong>
                      <div className="tag-list" style={{ marginTop: '4px' }}>
                        {res.data.actress && res.data.actress.map((a, i) => (
                          <span key={i} className="tag tag-accent">{a}</span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>标签:</strong>
                      <div className="tag-list" style={{ marginTop: '4px' }}>
                        {res.data.genre && res.data.genre.map((g, i) => (
                          <span key={i} className="tag">{g}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal (Simple overlay) */}
      {editingAvid && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel fade-in" style={{ width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0 }}>编辑元数据 - {editingAvid}</h3>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>标题</label>
                <input type="text" value={editFormData.title || ''} onChange={e => setEditFormData({...editFormData, title: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>发行日期</label>
                  <input type="text" value={editFormData.publish_date || ''} onChange={e => setEditFormData({...editFormData, publish_date: e.target.value})} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>时长 (分钟)</label>
                  <input type="text" value={editFormData.duration || ''} onChange={e => setEditFormData({...editFormData, duration: e.target.value})} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>制作商 (Studio)</label>
                  <input type="text" value={editFormData.producer || ''} onChange={e => setEditFormData({...editFormData, producer: e.target.value})} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>导演</label>
                  <input type="text" value={editFormData.director || ''} onChange={e => setEditFormData({...editFormData, director: e.target.value})} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>演员 (逗号分隔)</label>
                <input 
                  type="text" 
                  value={(editFormData.actress || []).join(', ')} 
                  onChange={e => setEditFormData({...editFormData, actress: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} 
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>标签 (逗号分隔)</label>
                <input 
                  type="text" 
                  value={(editFormData.genre || []).join(', ')} 
                  onChange={e => setEditFormData({...editFormData, genre: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} 
                />
              </div>
            </div>
            <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEditingAvid(null)}>取消</button>
              <button className="primary" onClick={saveEditedData}>保存更改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScrapePage;
