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
      return new Promise((resolve, reject) => {
        if (entry.isFile) {
          entry.file((file) => {
            files.push({ path: currentPath, file });
            resolve();
          }, reject);
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          dirReader.readEntries(async (entries) => {
            const promises = entries.map((entry) =>
              traverseDirectory(
                entry,
                currentPath ? `${currentPath}/${entry.name}` : entry.name
              )
            );
            await Promise.all(promises);
            resolve();
          }, reject);
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
  return new Promise((resolve) => {
    const dirReader = entry.createReader();
    dirReader.readEntries(async (results) => {
      // First check if .modinfo exists in the root
      const hasModInfo = results.some((result) =>
        result.name.endsWith(".modinfo")
      );

      if (hasModInfo) {
        resolve({
          hasModInfo: true,
          entry,
          useOriginalName: false,
        });
        return;
      }

      // If no modinfo in root, check first subfolder
      const subfolders = results.filter((result) => result.isDirectory);
      if (subfolders.length === 1) {
        const subfolderReader = subfolders[0].createReader();
        subfolderReader.readEntries((subResults) => {
          const hasModInfoInSubfolder = subResults.some((result) =>
            result.name.endsWith(".modinfo")
          );
          resolve({
            hasModInfo: hasModInfoInSubfolder,
            entry: hasModInfoInSubfolder ? subfolders[0] : entry,
            useOriginalName: hasModInfoInSubfolder,
            originalName: entry.name,
          });
        });
      } else {
        resolve({
          hasModInfo: false,
          entry,
          useOriginalName: false,
        });
      }
    });
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
    for (const item of e.dataTransfer.items) {
      if (item.kind !== "file") continue;

      const file = item.getAsFile();
      const fileName = file.name.toLowerCase();

      if (
        APP_CONSTANTS.SUPPORTED_ARCHIVES.some((ext) => fileName.endsWith(ext))
      ) {
        utils.showNotification(
          APP_CONSTANTS.MESSAGES.ERROR_EXTRACT_FIRST,
          APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
        );
        return;
      }

      const entry = item.webkitGetAsEntry();
      if (!entry?.isDirectory) {
        utils.showNotification(
          APP_CONSTANTS.MESSAGES.ERROR_FOLDER_ONLY,
          APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
        );
        continue;
      }

      try {
        const {
          entry: validEntry,
          useOriginalName,
          originalName,
        } = await modManager.handleDirectoryEntry(entry);

        const files = await utils.getAllFiles(validEntry);
        await window.api.validateAndInstallMod({
          folderName: useOriginalName ? originalName : validEntry.name,
          files,
        });

        utils.showNotification(
          APP_CONSTANTS.MESSAGES.MOD_INSTALLED,
          APP_CONSTANTS.NOTIFICATION_TYPES.SUCCESS
        );
        await modManager.scanAndDisplayMods();
      } catch (error) {
        utils.showNotification(
          error.message,
          APP_CONSTANTS.NOTIFICATION_TYPES.ERROR
        );
      }
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
