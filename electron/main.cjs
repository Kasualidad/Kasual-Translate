const { app, BrowserWindow, dialog, shell, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let server;
const APP_NAME = 'Kasual Translate';
const APP_USER_MODEL_ID = 'com.kasual.translate';
const APP_ICON = path.join(__dirname, 'assets', 'kasual-logo.ico');
const LOCAL_APP_ORIGIN = /^http:\/\/127\.0\.0\.1:\d+$/;
const RELEASES_API_URL = 'https://api.github.com/repos/Kasualidad/Kasual-Translate/releases/latest';
const UPDATE_CHECK_DELAY_MS = 5000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const NATIVE_TEXTS = {
  en: {
    alreadyUpdated: 'Kasual Translate is already up to date.',
    currentVersion: 'Current version: {0}',
    updateTitle: 'Update available',
    updateMessage: 'Kasual Translate {0} is available.',
    updateDetail: 'Current version: {0}\nGitHub will open so you can download the updated portable executable.',
    download: 'Download',
    later: 'Not now',
    updateErrorTitle: 'Update error',
    updateErrorDetail: 'Could not check GitHub Releases.\n{0}'
  },
  es: {
    alreadyUpdated: 'Kasual Translate ya esta actualizado.',
    currentVersion: 'Version actual: {0}',
    updateTitle: 'Actualizacion disponible',
    updateMessage: 'Kasual Translate {0} esta disponible.',
    updateDetail: 'Version actual: {0}\nSe abrira GitHub para descargar el portable actualizado.',
    download: 'Descargar',
    later: 'Ahora no',
    updateErrorTitle: 'Error de actualizacion',
    updateErrorDetail: 'No se pudo comprobar GitHub Releases.\n{0}'
  },
  ca: {
    alreadyUpdated: 'Kasual Translate ja esta actualitzat.',
    currentVersion: 'Versio actual: {0}',
    updateTitle: 'Actualitzacio disponible',
    updateMessage: 'Kasual Translate {0} esta disponible.',
    updateDetail: 'Versio actual: {0}\nS’obrira GitHub per descarregar el portable actualitzat.',
    download: 'Descarregar',
    later: 'Ara no',
    updateErrorTitle: 'Error d’actualitzacio',
    updateErrorDetail: 'No s’ha pogut comprovar GitHub Releases.\n{0}'
  },
  fr: {
    alreadyUpdated: 'Kasual Translate est deja a jour.',
    currentVersion: 'Version actuelle : {0}',
    updateTitle: 'Mise a jour disponible',
    updateMessage: 'Kasual Translate {0} est disponible.',
    updateDetail: 'Version actuelle : {0}\nGitHub va s’ouvrir pour telecharger le portable mis a jour.',
    download: 'Telecharger',
    later: 'Plus tard',
    updateErrorTitle: 'Erreur de mise a jour',
    updateErrorDetail: 'Impossible de verifier GitHub Releases.\n{0}'
  },
  de: {
    alreadyUpdated: 'Kasual Translate ist bereits aktuell.',
    currentVersion: 'Aktuelle Version: {0}',
    updateTitle: 'Update verfuegbar',
    updateMessage: 'Kasual Translate {0} ist verfuegbar.',
    updateDetail: 'Aktuelle Version: {0}\nGitHub wird geoeffnet, um die aktualisierte Portable-Version herunterzuladen.',
    download: 'Herunterladen',
    later: 'Nicht jetzt',
    updateErrorTitle: 'Update-Fehler',
    updateErrorDetail: 'GitHub Releases konnten nicht geprueft werden.\n{0}'
  },
  pt: {
    alreadyUpdated: 'Kasual Translate ja esta atualizado.',
    currentVersion: 'Versao atual: {0}',
    updateTitle: 'Atualizacao disponivel',
    updateMessage: 'Kasual Translate {0} esta disponivel.',
    updateDetail: 'Versao atual: {0}\nO GitHub sera aberto para baixar o portable atualizado.',
    download: 'Baixar',
    later: 'Agora nao',
    updateErrorTitle: 'Erro de atualizacao',
    updateErrorDetail: 'Nao foi possivel verificar GitHub Releases.\n{0}'
  },
  ru: {
    alreadyUpdated: 'Kasual Translate уже обновлен.',
    currentVersion: 'Текущая версия: {0}',
    updateTitle: 'Доступно обновление',
    updateMessage: 'Доступен Kasual Translate {0}.',
    updateDetail: 'Текущая версия: {0}\nGitHub откроется для загрузки обновленного portable-файла.',
    download: 'Скачать',
    later: 'Не сейчас',
    updateErrorTitle: 'Ошибка обновления',
    updateErrorDetail: 'Не удалось проверить GitHub Releases.\n{0}'
  },
  zh: {
    alreadyUpdated: 'Kasual Translate 已是最新版本。',
    currentVersion: '当前版本：{0}',
    updateTitle: '有可用更新',
    updateMessage: 'Kasual Translate {0} 可用。',
    updateDetail: '当前版本：{0}\n将打开 GitHub 下载更新后的便携版。',
    download: '下载',
    later: '稍后',
    updateErrorTitle: '更新错误',
    updateErrorDetail: '无法检查 GitHub Releases。\n{0}'
  }
};

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    res.end(data);
  });
}

function startStaticServer() {
  const distPath = path.join(__dirname, '..', 'dist');

  server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(distPath, safePath === path.sep ? 'index.html' : safePath);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(distPath))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(resolvedPath, (error, stats) => {
      if (!error && stats.isFile()) {
        sendFile(res, resolvedPath);
        return;
      }

      sendFile(res, path.join(distPath, 'index.html'));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

function isLocalAppUrl(url) {
  try {
    return LOCAL_APP_ORIGIN.test(new URL(url).origin);
  } catch {
    return false;
  }
}

function isAllowedAppFileSystemRequest(webContents, url) {
  return isLocalAppUrl(url) || isLocalAppUrl(webContents?.getURL());
}

function configureAppPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestUrl = details.requestingUrl || webContents.getURL();
    callback(permission === 'fileSystem' && isAllowedAppFileSystemRequest(webContents, requestUrl));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission !== 'fileSystem') return false;
    return isAllowedAppFileSystemRequest(webContents, requestingOrigin)
      || isAllowedAppFileSystemRequest(webContents, details?.requestingUrl);
  });
}

function normalizeVersion(version) {
  return String(version || '').replace(/^v/i, '').trim();
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split('.').map(Number);
  const right = normalizeVersion(b).split('.').map(Number);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    const leftValue = Number.isFinite(left[index]) ? left[index] : 0;
    const rightValue = Number.isFinite(right[index]) ? right[index] : 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function getPortableDownloadUrl(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const portableAsset = assets.find((asset) => (
    typeof asset.name === 'string'
    && asset.name.toLowerCase().endsWith('.exe')
    && !asset.name.toLowerCase().includes('setup')
  ));

  return portableAsset?.browser_download_url || release.html_url;
}

function getNativeTexts() {
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('es')) return NATIVE_TEXTS.es;
  if (locale.startsWith('ca')) return NATIVE_TEXTS.ca;
  if (locale.startsWith('fr')) return NATIVE_TEXTS.fr;
  if (locale.startsWith('de')) return NATIVE_TEXTS.de;
  if (locale.startsWith('pt')) return NATIVE_TEXTS.pt;
  if (locale.startsWith('ru') || locale.startsWith('uk')) return NATIVE_TEXTS.ru;
  if (locale.startsWith('zh')) return NATIVE_TEXTS.zh;
  return NATIVE_TEXTS.en;
}

function nativeText(key, ...args) {
  const template = getNativeTexts()[key] || NATIVE_TEXTS.en[key] || key;
  return args.reduce((text, value, index) => text.replaceAll(`{${index}}`, String(value)), template);
}

async function checkPortableUpdate(mainWindow, silent = true) {
  if (!app.isPackaged) return;

  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Kasual-Translate'
      }
    });

    if (!response.ok) throw new Error(`GitHub ${response.status}`);

    const release = await response.json();
    const latestVersion = normalizeVersion(release.tag_name || release.name);
    const currentVersion = app.getVersion();

    if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
      if (!silent) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: APP_NAME,
          message: nativeText('alreadyUpdated'),
          detail: nativeText('currentVersion', currentVersion)
        });
      }
      return;
    }

    const downloadUrl = getPortableDownloadUrl(release);
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: [nativeText('download'), nativeText('later')],
      defaultId: 0,
      cancelId: 1,
      title: nativeText('updateTitle'),
      message: nativeText('updateMessage', latestVersion),
      detail: nativeText('updateDetail', currentVersion)
    });

    if (result.response === 0 && downloadUrl) {
      shell.openExternal(downloadUrl);
    }
  } catch (error) {
    console.error('No se pudo comprobar actualizaciones:', error);
    if (!silent) {
      dialog.showErrorBox(nativeText('updateErrorTitle'), nativeText('updateErrorDetail', error.message || error));
    }
  }
}

function setupPortableUpdater(mainWindow) {
  if (!app.isPackaged) return;

  const checkForUpdates = () => checkPortableUpdate(mainWindow, true);

  setTimeout(checkForUpdates, UPDATE_CHECK_DELAY_MS);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

async function createWindow() {
  const port = await startStaticServer();
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#1f1d19',
    title: APP_NAME,
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(APP_NAME);
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setupPortableUpdater(mainWindow);
}

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

app.whenReady().then(() => {
  configureAppPermissions();
  createWindow();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
