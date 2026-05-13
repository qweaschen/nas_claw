import React, { useState, useEffect } from 'react';

const DEFAULT_SCRAPER_PRIORITY = ['fc2official', 'fc2av123', 'jav321', 'javdb', 'javbus', 'missav'];

const SCRAPER_LABELS = {
  fc2official: 'FC2 官方',
  fc2av123: 'FC2 备用',
  jav321: 'JAV321',
  javdb: 'JavDB',
  javbus: 'JavBus',
  missav: 'MissAV',
};

const createDefaultSettings = () => ({
  proxy: '',
  scraperPriority: DEFAULT_SCRAPER_PRIORITY,
  downloadCover: true,
  downloadFanart: true,
  createNFO: true,
});

function normalizeSettings(data = {}) {
  const savedPriority = Array.isArray(data.scraperPriority) ? data.scraperPriority : [];
  const scraperPriority = [
    ...savedPriority.filter(source => DEFAULT_SCRAPER_PRIORITY.includes(source)),
    ...DEFAULT_SCRAPER_PRIORITY.filter(source => !savedPriority.includes(source)),
  ];

  return {
    ...createDefaultSettings(),
    ...data,
    scraperPriority,
  };
}

function SettingsPage() {
  const [settings, setSettings] = useState(createDefaultSettings());

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await window.electronAPI.loadSettings();
    setSettings(normalizeSettings(data));
  };

  const handleSave = async () => {
    setSaving(true);
    await window.electronAPI.saveSettings(settings);
    setTimeout(() => {
      setSaving(false);
      alert('设置已保存');
    }, 500);
  };

  const togglePriority = (source) => {
    let newPriority = [...settings.scraperPriority];
    if (newPriority.includes(source)) {
      newPriority = newPriority.filter(s => s !== source);
    } else {
      newPriority.push(source);
    }
    setSettings({ ...settings, scraperPriority: newPriority });
  };

  return (
    <div>
      <div className="page-header">
        <h2>全局设置</h2>
        <p>配置代理和刮削偏好（设置保存在本地）</p>
      </div>

      <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* Network section */}
        <section>
          <h3 style={{ marginBottom: '15px' }}>网络设置</h3>
          <div className="form-group">
            <label>HTTP 代理 (例如: http://127.0.0.1:7890)</label>
            <input 
              type="text" 
              placeholder="留空则不使用代理" 
              value={settings.proxy || ''}
              onChange={e => setSettings({ ...settings, proxy: e.target.value })}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              注意：目前内置了各网站的境内免翻镜像域名，通常不需要挂代理即可使用。
            </p>
          </div>
        </section>

        {/* Scrapers section */}
        <section>
          <h3 style={{ marginBottom: '15px' }}>刮削源 (按勾选顺序尝试)</h3>
          <div className="scraper-grid">
            {DEFAULT_SCRAPER_PRIORITY.map(source => {
              const checked = settings.scraperPriority.includes(source);
              return (
                <label key={source} className={`scraper-option ${checked ? 'checked' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={checked}
                    onChange={() => togglePriority(source)}
                  />
                  <span className="scraper-name">{SCRAPER_LABELS[source]}</span>
                  {checked && (
                    <span className="status-badge scraper-rank">
                      优先级 {settings.scraperPriority.indexOf(source) + 1}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {/* Output section */}
        <section>
          <h3 style={{ marginBottom: '15px' }}>输出设置</h3>
          
          {/* 整理模式 */}
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: '500' }}>整理模式</label>
            <div style={{ display: 'flex', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="organizeMode"
                  checked={(settings.organizeMode || 'avid') === 'avid'}
                  onChange={() => setSettings({ ...settings, organizeMode: 'avid' })}
                />
                按番号整理
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="organizeMode"
                  checked={settings.organizeMode === 'actress'}
                  onChange={() => setSettings({ ...settings, organizeMode: 'actress' })}
                />
                按女优分类
              </label>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              {(settings.organizeMode || 'avid') === 'avid' 
                ? '整理完成/SSIS-001/SSIS-001.mp4' 
                : '整理完成/葵つかさ/SSIS-001/SSIS-001.mp4'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={settings.createNFO}
                onChange={e => setSettings({ ...settings, createNFO: e.target.checked })}
              />
              生成 NFO 文件 (Emby/Jellyfin 兼容)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={settings.downloadCover}
                onChange={e => setSettings({ ...settings, downloadCover: e.target.checked })}
              />
              下载封面 (poster.jpg)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={settings.downloadFanart}
                onChange={e => setSettings({ ...settings, downloadFanart: e.target.checked })}
              />
              下载背景图 (fanart.jpg)
            </label>
          </div>
        </section>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? '正在保存...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
