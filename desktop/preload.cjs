const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, value) => {
  const result = await ipcRenderer.invoke(channel, value);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('hustle', {
  get: () => invoke('focus:get'),
  request: input => invoke('dashboard:request', input),
  focusTask: id => invoke('focus:task', id),
  dashboard: () => invoke('focus:dashboard'),
  onRefresh: callback => {
    const listener = () => callback();
    ipcRenderer.on('dashboard:refresh', listener);
    return () => ipcRenderer.removeListener('dashboard:refresh', listener);
  },
  command: (type, value) => invoke('focus:command', { type, value }),
  settings: changes => invoke('focus:settings', changes),
  connect: (server, code) => invoke('focus:connect', { server, code }),
  sync: () => invoke('focus:sync'),
  open: () => invoke('focus:open'),
  hide: () => invoke('focus:hide'),
  dataFolder: () => invoke('focus:data-folder'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('focus:state', listener);
    return () => ipcRenderer.removeListener('focus:state', listener);
  },
  onView: callback => {
    const listener = (_event, view) => callback(view);
    ipcRenderer.on('focus:view', listener);
    return () => ipcRenderer.removeListener('focus:view', listener);
  },
});
