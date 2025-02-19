/**
 * Conexion's Civilization VII Mod Manager
 * Copyright (C) 2024 Conexion (CivConexion)
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs").promises;

try {
  require("electron-reloader")(module, {
    debug: true,
    watchRenderer: true,
  });
} catch (e) {
  console.error(e);
}

const USER_DATA_FILE = path.join(app.getPath("userData"), "settings.json");

async function readSettings() {
  try {
    const data = await fs.readFile(USER_DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function writeSettings(settings) {
  await fs.writeFile(USER_DATA_FILE, JSON.stringify(settings, null, 2));
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    icon: path.join(__dirname, "assets/icons/png/512x512.png"),
    autoHideMenuBar: true,
    backgroundColor: "#13131f",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setMenu(null);

  // Toggle DevTools with F12
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === "F5") {
      mainWindow.reload();
      event.preventDefault();
    }
  });
};

app.whenReady().then(() => {
  createWindow();

  ipcMain.on("minimize-window", () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  ipcMain.on("maximize-window", () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.isMaximized() ? win.unmaximize() : win?.maximize();
  });

  ipcMain.on("close-window", () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  ipcMain.handle("select-directory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.filePaths[0];
  });

  ipcMain.handle("get-custom-mods-path", async () => {
    const settings = await readSettings();
    return settings.customModsPath || null;
  });

  ipcMain.handle("set-custom-mods-path", async (_, path) => {
    const settings = await readSettings();
    settings.customModsPath = path;
    await writeSettings(settings);
    return true;
  });

  ipcMain.handle("get-username", () => os.userInfo().username);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
