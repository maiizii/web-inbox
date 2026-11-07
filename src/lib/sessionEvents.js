// 登录态失效/恢复的全局广播（跨组件、与 UI 解耦）
//  - apiClient 在业务接口（非 /api/auth/*）收到 401 时调用 notifySessionExpired
//  - SessionExpiredModal 重新登录成功后调用 notifySessionRestored，
//    编辑器监听到后会立即重试保存未保存的内容
const expiredListeners = new Set();
const restoredListeners = new Set();

function emit(listeners) {
  listeners.forEach(fn => {
    try { fn(); } catch {}
  });
}

export function onSessionExpired(fn) {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}

export function notifySessionExpired() {
  emit(expiredListeners);
}

export function onSessionRestored(fn) {
  restoredListeners.add(fn);
  return () => restoredListeners.delete(fn);
}

export function notifySessionRestored() {
  emit(restoredListeners);
}
