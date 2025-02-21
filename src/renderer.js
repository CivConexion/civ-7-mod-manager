const SUPPORTED_ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z"];

const utils = {
  sanitizePathForDisplay: (path) => {
    if (!path) return "Not set";
    const username = window.api.getUsername();
    return path.replace(username, "{User}");
  },

  showNotification: (message, type = "info") => {
    const template = document.getElementById("notification-template");
    const element = template.content.cloneNode(true);
    const notification = element.querySelector(".notification");

    notification.dataset.notificationType = type;
    notification.querySelector(".notification-content").textContent = message;

    document.body.appendChild(notification);

    setTimeout(
      () => notification.remove(),
      APP_CONSTANTS.NOTIFICATION.DURATION
    );
  },

  getAllFiles: async (entry, path = "") => {
    const files = [];

    const traverseDirectory = async (entry, currentPath) => {
      return new Promise(async (resolve, reject) => {
        if (entry.isFile) {
          // Handle FileSystem API entry
          if (typeof entry.file === "function") {
            entry.file((file) => {
              files.push({ path: currentPath, file });
              resolve();
            }, reject);
          }
          // Handle custom entry
          else {
            try {
              const response = await fetch(`file://${entry.path}`);
              const blob = await response.blob();
              const file = new File([blob], entry.name, {
                type: blob.type,
              });
              files.push({ path: currentPath, file });
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        } else if (entry.isDirectory) {
          try {
            // Handle both FileSystem API and custom entries
            const reader = entry.createReader
              ? entry.createReader()
              : {
                  readEntries: (callback) => {
                    window.api
                      .readDirectory(entry.path)
                      .then((entries) => callback(entries))
                      .catch((error) => reject(error));
                  },
                };

            reader.readEntries(async (entries) => {
              try {
                const promises = entries.map((entry) =>
                  traverseDirectory(
                    entry,
                    currentPath ? `${currentPath}/${entry.name}` : entry.name
                  )
                );
                await Promise.all(promises);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          } catch (error) {
            reject(error);
          }
        } else {
          resolve();
        }
      });
    };

    await traverseDirectory(entry, path);
    return files;
  },
};

// DOM Manipulation
const domHelpers = {
  createModElement: (mod) => {
    const template = document.getElementById("mod-item-template");
    const element = template.content.cloneNode(true);
    const modItem = element.querySelector(".mod-item");

    modItem.dataset.modId = mod.id;
    modItem.dataset.modFolder = mod.folder;
    modItem.classList.toggle("disabled", !mod.enabled);
    modItem.dataset.modState = mod.enabled
      ? APP_CONSTANTS.MOD_STATES.ENABLED
      : APP_CONSTANTS.MOD_STATES.DISABLED;

    const img = element.querySelector(".mod-icon img");
    img.src = mod.icon;
    img.alt = mod.name;

    element.querySelector(".mod-name").textContent = mod.name;
    element.querySelector(".mod-author").textContent = mod.authors;
    element.querySelector(".mod-version").textContent = `v${mod.version}`;
    element.querySelector(".mod-description").textContent = mod.description;

    const toggleButton = element.querySelector(".toggle-mod");
    const buttonText = toggleButton.querySelector(".button-text");
    buttonText.textContent = mod.enabled ? "Enabled" : "Disabled";
    toggleButton.classList.toggle("enabled", mod.enabled);
    toggleButton.classList.toggle("disabled", !mod.enabled);

    return element;
  },
};

// Core Functionality
const modManager = {
  handleDirectoryEntry: async (entry) => {
    const {
      hasModInfo,
      entry: validEntry,
      useOriginalName,
      originalName,
    } = await checkForModInfo(entry);

    if (!hasModInfo) {
      throw new Error(APP_CONSTANTS.MESSAGES.ERROR_NO_MODINFO);
    }

    const modFolderName = useOriginalName ? originalName : validEntry.name;

    // Check if mod already exists
    const existingMod = await window.api.checkModExists(modFolderName);

    if (existingMod.exists) {
      const shouldOverwrite = await modManager.confirmOverwrite(modFolderName);

      if (!shouldOverwrite) {
        throw new Error("Installation cancelled by user");
      }

      // Delete existing mod
      try {
        await window.api.deleteMod(modFolderName, existingMod.isEnabled);
        utils.showNotification(
          "Existing mod removed",
          APP_CONSTANTS.NOTIFICATION_TYPES.INFO
        );
      } catch (error) {
        console.error("Error deleting existing mod:", error);
        throw new Error("Failed to remove existing mod");
      }
    }

    return {
      entry: validEntry,
      useOriginalName,
      originalName,
    };
  },

  scanAndDisplayMods: async () => {
    const modsListElement = document.getElementById("installed-mods");

    try {
      const mods = await window.api.scanMods();

      if (mods.length === 0) {
        modsListElement.innerHTML =
          "<p class='no-mods'>No mods found</p><p class='notes'>Tip: Check out the options if you installed the game in a custom directory.</p>";
        return;
      }

      const sortedMods = mods.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const template = document.getElementById("mods-list-template");
      const element = template.content.cloneNode(true);
      const modsGrid = element.querySelector(".mods-grid");

      sortedMods.forEach((mod) => {
        modsGrid.appendChild(domHelpers.createModElement(mod));
      });

      modsListElement.innerHTML = "";
      modsListElement.appendChild(element);
    } catch (error) {
      modsListElement.innerHTML = `<p class="error">Error scanning mods: ${error.message}</p>`;
    }
  },

  handleModAction: async (event) => {
    const button = event.target.closest(".action-btn");
    if (!button) return;

    const modItem = button.closest(".mod-item");
    const modFolder = modItem.dataset.modFolder;
    const modName = modItem.querySelector(".mod-name").textContent;
    const currentState = modItem.dataset.modState;
    const actionType = button.dataset.actionType;

    try {
      if (actionType === APP_CONSTANTS.ACTIONS.TOGGLE) {
        const isEnabled = currentState === APP_CONSTANTS.MOD_STATES.ENABLED;
        await window.api.toggleMod(modFolder, isEnabled);
        utils.showNotification(
          isEnabled
            ? APP_CONSTANTS.MESSAGES.MOD_DISABLED
            : APP_CONSTANTS.MESSAGES.MOD_ENABLED,
          APP_CONSTANTS.NOTIFICATION_TYPES.SUCCESS
        );
      } else if (actionType === APP_CONSTANTS.ACTIONS.DELETE) {
        const confirmed = confirm(
          APP_CONSTANTS.MESSAGES.CONFIRM_DELETE(modName)
        );

        if (confirmed) {
          const isEnabled = currentState === APP_CONSTANTS.MOD_STATES.ENABLED;
          await window.api.deleteMod(modFolder, isEnabled);
          utils.showNotification(
            APP_CONSTANTS.MESSAGES.MOD_DELETED,
            APP_CONSTANTS.NOTIFICATION_TYPES.SUCCESS
          );
        }
      }

      await modManager.scanAndDisplayMods();
    } catch (error) {
      console.error("Action error:", error);
      utils.showNotification(
        error.message,
        APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
      );
    }
  },

  confirmOverwrite: (modName) => {
    return new Promise((resolve) => {
      const message =
        'The mod "' +
        modName +
        '" is already installed.\n\nDo you want to overwrite it with the new version?';
      const result = confirm(message);
      resolve(result);
    });
  },
};

const checkForModInfo = async (entry) => {
  return new Promise(async (resolve) => {
    const checkDirectory = async (dirPath, rootPath) => {
      const entries = await window.api.readDirectory(dirPath);

      // First check if .modinfo exists in the current directory
      const hasModInfo = entries.some((entry) =>
        entry.name.endsWith(".modinfo")
      );
      if (hasModInfo) {
        return {
          found: true,
          path: dirPath,
          rootPath: rootPath,
        };
      }

      // Check immediate subfolders
      for (const entry of entries) {
        if (entry.isDirectory) {
          const result = await checkDirectory(entry.path, rootPath);
          if (result.found) {
            return result;
          }
        }
      }

      return { found: false, path: null, rootPath: null };
    };

    if (entry.isFile) {
      // Handle archive file
      const buffer = await new Promise((resolve) => {
        entry.file((file) => {
          file.arrayBuffer().then(resolve);
        });
      });

      const { modPath, cleanup } = await window.api.handleArchiveFile(
        buffer,
        entry.name
      );

      try {
        const result = await checkDirectory(modPath, modPath);
        if (result.found) {
          resolve({
            hasModInfo: true,
            entry: {
              name: await window.api.pathBasename(result.rootPath),
              isDirectory: true,
              path: result.rootPath,
              modInfoPath: result.path,
              createReader: () => ({
                readEntries: async (callback) => {
                  try {
                    const entries = await window.api.readDirectory(
                      result.rootPath
                    );
                    callback(
                      entries.map((entry) => ({
                        ...entry,
                        createReader: entry.isDirectory
                          ? () => ({
                              readEntries: async (cb) => {
                                const subEntries =
                                  await window.api.readDirectory(entry.path);
                                cb(subEntries);
                              },
                            })
                          : undefined,
                      }))
                    );
                  } catch (error) {
                    console.error("Error reading entries:", error);
                    callback([]);
                  }
                },
              }),
            },
            cleanup,
          });
        } else {
          cleanup();
          resolve({
            hasModInfo: false,
            entry: null,
            cleanup: () => {},
          });
        }
      } catch (error) {
        cleanup();
        resolve({
          hasModInfo: false,
          entry: null,
          cleanup: () => {},
        });
      }
    } else {
      // Handle directory
      const result = await checkDirectory(entry.path, entry.path);
      resolve({
        hasModInfo: result.found,
        entry: result.found
          ? {
              name: await window.api.pathBasename(result.rootPath),
              isDirectory: true,
              path: result.rootPath,
              modInfoPath: result.path,
              createReader: () => ({
                readEntries: async (callback) => {
                  try {
                    const entries = await window.api.readDirectory(
                      result.rootPath
                    );
                    callback(
                      entries.map((entry) => ({
                        ...entry,
                        createReader: entry.isDirectory
                          ? () => ({
                              readEntries: async (cb) => {
                                const subEntries =
                                  await window.api.readDirectory(entry.path);
                                cb(subEntries);
                              },
                            })
                          : undefined,
                      }))
                    );
                  } catch (error) {
                    console.error("Error reading entries:", error);
                    callback([]);
                  }
                },
              }),
            }
          : null,
        cleanup: () => {},
      });
    }
  });
};

const optionsManager = {
  showOptionsDialog: async () => {
    const template = document.getElementById("options-dialog-template");
    const dialog = template.content.cloneNode(true);

    const overlay = dialog.querySelector(".overlay");
    const cancelBtn = dialog.querySelector(".cancel-options");
    const saveBtn = dialog.querySelector(".save-options");
    const browseBtn = dialog.querySelector(".browse-button");
    const directoryInput = dialog.querySelector("#mods-directory");
    const currentPathSpan = dialog.querySelector(".current-path");

    const closeDialog = () => overlay.remove();

    try {
      const currentPath =
        (await window.api.getCustomModsPath()) ||
        (await window.api.getModsPath());
      directoryInput.value = currentPath || "";
      currentPathSpan.textContent = utils.sanitizePathForDisplay(currentPath);
    } catch (error) {
      console.error("Error getting mods path:", error);
      currentPathSpan.textContent = "Error getting path";
    }

    // Event handlers
    cancelBtn.addEventListener("click", closeDialog);

    browseBtn.addEventListener("click", async () => {
      const path = await window.api.selectDirectory();
      if (path) {
        directoryInput.value = path;
        currentPathSpan.textContent = utils.sanitizePathForDisplay(path);
      }
    });

    saveBtn.addEventListener("click", async () => {
      const newPath = directoryInput.value;
      if (newPath) {
        await window.api.setCustomModsPath(newPath);
        utils.showNotification(
          "Mods directory updated successfully",
          "success"
        );
        await modManager.scanAndDisplayMods();
      }
      closeDialog();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDialog();
    });

    document.body.appendChild(dialog);
  },
};

const refreshManager = {
  isRefreshing: false,

  startRefresh: () => {
    const refreshButton = document.querySelector("#refresh-button");
    refreshButton.classList.add("refreshing");
    refreshManager.isRefreshing = true;
  },

  endRefresh: () => {
    const refreshButton = document.querySelector("#refresh-button");
    refreshButton.classList.remove("refreshing");
    refreshManager.isRefreshing = false;
  },

  handleRefresh: async () => {
    if (refreshManager.isRefreshing) return;

    try {
      refreshManager.startRefresh();
      await modManager.scanAndDisplayMods();
      utils.showNotification(
        "Mod list refreshed",
        APP_CONSTANTS.NOTIFICATION_TYPES.SUCCESS
      );
    } catch (error) {
      utils.showNotification(
        "Failed to refresh mod list",
        APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
      );
      console.error("Refresh error:", error);
    } finally {
      refreshManager.endRefresh();
    }
  },
};

// Event Handlers
const initializeDropZone = () => {
  const dropZone = document.querySelector(".drop-zone");

  const events = {
    prevent: [
      APP_CONSTANTS.EVENTS.DRAG.ENTER,
      APP_CONSTANTS.EVENTS.DRAG.OVER,
      APP_CONSTANTS.EVENTS.DRAG.LEAVE,
      APP_CONSTANTS.EVENTS.DRAG.DROP,
    ],
    addDragOver: [
      APP_CONSTANTS.EVENTS.DRAG.ENTER,
      APP_CONSTANTS.EVENTS.DRAG.OVER,
    ],
    removeDragOver: [
      APP_CONSTANTS.EVENTS.DRAG.LEAVE,
      APP_CONSTANTS.EVENTS.DRAG.DROP,
    ],
  };

  // Prevent default behaviors
  events.prevent.forEach((event) => {
    dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  events.addDragOver.forEach((event) => {
    dropZone.addEventListener(event, () => dropZone.classList.add("drag-over"));
  });

  events.removeDragOver.forEach((event) => {
    dropZone.addEventListener(event, () =>
      dropZone.classList.remove("drag-over")
    );
  });

  // Handle drop event
  dropZone.addEventListener(APP_CONSTANTS.EVENTS.DRAG.DROP, async (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();

      // Get all items from the drop event
      const entries = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        }
      }

      if (entries.length === 0) {
        console.log("No valid entries found");
        return;
      }

      for (const entry of entries) {
        try {
          // Handle archive files

          // In renderer.js, update the archive handling section:

          if (
            entry.isFile &&
            APP_CONSTANTS.SUPPORTED_ARCHIVES.some((ext) =>
              entry.name.toLowerCase().endsWith(ext)
            )
          ) {
            await new Promise((resolve, reject) => {
              const handleArchiveFile = async () => {
                try {
                  let buffer;
                  // Handle FileSystem API entry
                  if (typeof entry.file === "function") {
                    const file = await new Promise((resolve, reject) => {
                      entry.file(resolve, reject);
                    });
                    buffer = await file.arrayBuffer();
                  }
                  // Handle regular file
                  else {
                    const response = await fetch(`file://${entry.path}`);
                    buffer = await response.arrayBuffer();
                  }

                  // Handle the archive through the preload API
                  const { modFolder, modPath, cleanup } =
                    await window.api.handleArchiveFile(buffer, entry.name);

                  try {
                    const directoryEntry = {
                      name: modFolder,
                      isDirectory: true,
                      path: modPath,
                      createReader: () => ({
                        readEntries: async (callback) => {
                          try {
                            const entries = await window.api.readDirectory(
                              modPath
                            );
                            callback(entries);
                          } catch (error) {
                            console.error("Error reading entries:", error);
                            callback([]);
                          }
                        },
                      }),
                    };

                    const directoryResult =
                      await modManager.handleDirectoryEntry(directoryEntry);

                    if (directoryResult) {
                      const files = await utils.getAllFiles(
                        directoryResult.entry
                      );
                      await window.api.validateAndInstallMod({
                        folderName: directoryResult.useOriginalName
                          ? directoryResult.originalName
                          : directoryResult.entry.name,
                        files,
                      });

                      utils.showNotification(
                        APP_CONSTANTS.MESSAGES.MOD_INSTALLED(entry.name),
                        APP_CONSTANTS.NOTIFICATION_TYPES.SUCCESS
                      );
                    }
                  } finally {
                    cleanup();
                  }

                  resolve();
                } catch (error) {
                  console.error("Error processing archive:", error);
                  utils.showNotification(
                    `Error processing archive ${entry.name}: ${error.message}`,
                    APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
                  );
                  reject(error);
                }
              };

              handleArchiveFile().catch(reject);
            });
          }

          // Handle directories
          else if (entry.isDirectory) {
            const directoryResult = await modManager.handleDirectoryEntry(
              entry
            );
            if (!directoryResult || !directoryResult.entry) {
              utils.showNotification(
                `Failed to process directory: ${entry.name}`,
                APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
              );
              continue;
            }

            const files = await utils.getAllFiles(directoryResult.entry);
            const finalModName = directoryResult.useOriginalName
              ? directoryResult.originalName
              : directoryResult.entry.name;

            await window.api.validateAndInstallMod({
              folderName: finalModName,
              files,
            });

            utils.showNotification(
              APP_CONSTANTS.MESSAGES.MOD_INSTALLED(entry.name),
              APP_CONSTANTS.NOTIFICATION_TYPES.SUCCESS
            );
          }
          // Handle unsupported files
          else {
            utils.showNotification(
              APP_CONSTANTS.MESSAGES.ERROR_FOLDER_ONLY,
              APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
            );
          }
        } catch (itemError) {
          console.error("Error processing entry:", entry.name, itemError);
          utils.showNotification(
            `Error processing mod ${entry.name}: ${itemError.message}`,
            APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
          );
        }
      }

      // Refresh the mod list once after all mods are processed
      await modManager.scanAndDisplayMods();
    } catch (error) {
      console.error("Error in drop handler:", error);
      utils.showNotification(
        "Error processing dropped items",
        APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
      );
    }
  });
};

// Window Controls
const initializeWindowControls = () => {
  const controls = {
    minimize: [".window-control.minimize", window.api.minimizeWindow],
    maximize: [".window-control.maximize", window.api.maximizeWindow],
    close: [".window-control.close", window.api.closeWindow],
  };

  Object.entries(controls).forEach(([_, [selector, action]]) => {
    document.querySelector(selector)?.addEventListener("click", action);
  });
};

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  if (!window.api) {
    console.error("window.api is not defined!");
    return;
  }

  initializeWindowControls();
  initializeDropZone();

  const modsListElement = document.getElementById("mods-list");
  if (!modsListElement) {
    console.error("mods-list element not found!");
    return;
  }

  modsListElement.innerHTML = `
    <div id="installed-mods">
      <p>Scanning for installed mods...</p>
    </div>
  `;

  modsListElement.addEventListener("click", modManager.handleModAction);
  await modManager.scanAndDisplayMods();

  document
    .querySelector("#refresh-button")
    .addEventListener("click", refreshManager.handleRefresh);

  // Options
  document
    .querySelector("#options-button")
    .addEventListener("click", () =>
      optionsManager.showOptionsDialog().catch(console.error)
    );

  document
    .querySelector("#open-folder-button")
    .addEventListener("click", async () => {
      try {
        await window.api.openModsFolder();
      } catch (error) {
        utils.showNotification("Failed to open mods folder", "error");
      }
    });
});
