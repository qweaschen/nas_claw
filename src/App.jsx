import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import ConnectionPage from './pages/ConnectionPage';
import BrowserPage from './pages/BrowserPage';
import ScrapePage from './pages/ScrapePage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <Router>
      <div className="titlebar-drag-region"></div>
      <div className="sidebar">
        <div className="logo-container">
          <img src="/icon.png?v=anime-20260512" alt="Jav Claw" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
          <h1>Jav Claw</h1>
        </div>
        <nav className="nav-links">
          <NavLink 
            to="/" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end
          >
            <span className="nav-mark">01</span> 连接设置
          </NavLink>
          <NavLink 
            to="/browser" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-mark">02</span> 文件浏览
          </NavLink>
          <NavLink 
            to="/scrape" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-mark">03</span> 刮削任务
          </NavLink>
          <NavLink 
            to="/settings" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-mark">04</span> 全局设置
          </NavLink>
        </nav>
      </div>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ConnectionPage />} />
          <Route path="/browser" element={<BrowserPage />} />
          <Route path="/scrape" element={<ScrapePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
