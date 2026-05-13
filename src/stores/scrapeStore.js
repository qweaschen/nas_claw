/**
 * 刮削状态全局存储
 * 解决 React 路由切换导致 ScrapePage 重新挂载、状态丢失的问题。
 * 这个 store 存在于模块作用域，不会因组件卸载而销毁。
 */

const scrapeStore = {
  // 刮削结果（按 avid 索引）
  results: {},
  // 每个 avid 的进度
  progress: {},
  // 总体进度
  overallProgress: { current: 0, total: 0, file: '' },
  // 是否正在刮削
  scraping: false,
  // 是否暂停
  paused: false,
  // 日志
  scrapeLog: [],
  // 输出目录
  outputDir: '',

  // 重置（开始新一轮刮削时）
  reset() {
    this.results = {};
    this.progress = {};
    this.overallProgress = { current: 0, total: 0, file: '' };
    this.scrapeLog = [];
  },

  // 保存当前组件状态到 store
  save(state) {
    if (state.results !== undefined) this.results = state.results;
    if (state.progress !== undefined) this.progress = state.progress;
    if (state.overallProgress !== undefined) this.overallProgress = state.overallProgress;
    if (state.scraping !== undefined) this.scraping = state.scraping;
    if (state.paused !== undefined) this.paused = state.paused;
    if (state.scrapeLog !== undefined) this.scrapeLog = state.scrapeLog;
    if (state.outputDir !== undefined) this.outputDir = state.outputDir;
  },

  // 获取当前 store 状态
  getState() {
    return {
      results: this.results,
      progress: this.progress,
      overallProgress: this.overallProgress,
      scraping: this.scraping,
      paused: this.paused,
      scrapeLog: this.scrapeLog,
      outputDir: this.outputDir,
    };
  },
};

export default scrapeStore;
