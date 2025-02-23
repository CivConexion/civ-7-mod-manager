const { contextBridge, ipcRenderer } = require("electron");
const { shell } = require("electron");
const { APP_CONSTANTS } = require("./constants.js");
const { XMLParser } = require("fast-xml-parser");
const ArchiveHandler = require("./archiveUtils");
const path = require("path");
const tmp = require("tmp");
const fs = require("fs").promises;
const os = require("os");

const MODS_FOLDER = "Mods";
const DISABLED_MODS_FOLDER = "DisabledMods";

const findModInfoFile = async (dirPath) => {
  try {
    // Check root directory first
    const rootFiles = await fs.readdir(dirPath);
    const rootModInfo = rootFiles.find((file) => file.endsWith(".modinfo"));
    if (rootModInfo) {
      return {
        path: path.join(dirPath, rootModInfo),
        inSubfolder: false,
      };
    }

    // Check immediate subdirectories
    for (const item of rootFiles) {
      const subPath = path.join(dirPath, item);
      const stats = await fs.stat(subPath);
      if (stats.isDirectory()) {
        const subFiles = await fs.readdir(subPath);
        const subModInfo = subFiles.find((file) => file.endsWith(".modinfo"));
        if (subModInfo) {
          return {
            path: path.join(subPath, subModInfo),
            inSubfolder: true,
            subfolderName: item,
          };
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error in findModInfoFile:", error);
    return null;
  }
};

const parseModInfo = async (modInfoResult) => {
  if (!modInfoResult) return null;

  try {
    const xmlData = await fs.readFile(modInfoResult.path, "utf8");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "_",
    });
    const result = parser.parse(xmlData);
    return {
      ...result.Mod,
      inSubfolder: modInfoResult.inSubfolder,
      subfolderName: modInfoResult.subfolderName,
    };
  } catch (error) {
    console.error(`Error parsing modinfo:`, error);
    return null;
  }
};

const parseModInfoText = async (dirPath) => {
  try {
    const textPath = path.join(dirPath, "text", "en_us");
    const locMap = {};

    // Check if en_us directory exists
    try {
      await fs.access(textPath);
    } catch {
      return locMap;
    }

    // Get all XML files in the en_us directory
    const files = await fs.readdir(textPath);
    const xmlFiles = files.filter((file) =>
      file.toLowerCase().endsWith(".xml")
    );

    // Parse each XML file
    for (const xmlFile of xmlFiles) {
      try {
        const xmlData = await fs.readFile(path.join(textPath, xmlFile), "utf8");
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "_",
        });
        const result = parser.parse(xmlData);

        // Process localization entries if they exist
        if (result.Database?.EnglishText?.Row) {
          // Handle both single Row and array of Rows
          const rows = Array.isArray(result.Database.EnglishText.Row)
            ? result.Database.EnglishText.Row
            : [result.Database.EnglishText.Row];

          rows.forEach((row) => {
            if (row._Tag && row.Text) {
              // Only add if not already in map (first occurrence takes precedence)
              if (!locMap[row._Tag]) {
                locMap[row._Tag] = row.Text;
              }
            }
          });
        }
      } catch (error) {
        console.error(`Error parsing ${xmlFile}:`, error);
        // Continue to next file if one fails
        continue;
      }
    }

    return locMap;
  } catch (error) {
    console.error("Error reading localization files:", error);
    return {};
  }
};

const getUsername = () => os.userInfo().username;

// Get the path to the Mods folder based on the platform
const getModsPath = async () => {
  const customPath = await ipcRenderer.invoke("get-custom-mods-path");
  if (customPath) return customPath;

  const username = getUsername();
  const platform = os.platform();

  if (platform === "win32") {
    return path.join(
      "C:",
      "Users",
      username,
      "AppData",
      "Local",
      "Firaxis Games",
      "Sid Meier's Civilization VII",
      MODS_FOLDER
    );
  } else if (platform === "darwin") {
    return path.join(
      "/Users",
      username,
      "Library",
      "Application Support",
      "Civilization VII",
      MODS_FOLDER
    );
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
};

// Get the path to the DisabledMods folder based on the platform
const getDisabledModsPath = async () => {
  const customPath = await ipcRenderer.invoke("get-custom-mods-path");
  if (customPath)
    return path.join(path.dirname(customPath), DISABLED_MODS_FOLDER);

  const username = getUsername();
  const platform = os.platform();

  if (platform === "win32") {
    return path.join(
      "C:",
      "Users",
      username,
      "AppData",
      "Local",
      "Firaxis Games",
      "Sid Meier's Civilization VII",
      DISABLED_MODS_FOLDER
    );
  } else if (platform === "darwin") {
    return path.join(
      "/Users",
      username,
      "Library",
      "Application Support",
      "Civilization VII",
      DISABLED_MODS_FOLDER
    );
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
};

// Find the mod icon in a directory
const findModIcon = async (dirPath) => {
  const files = await fs.readdir(dirPath);
  const iconFile = files.find((file) => file.toLowerCase().startsWith("icon."));

  return iconFile
    ? `file://${path.join(dirPath, iconFile)}`
    : "assets/default-mod-icon.png";
};

// Scan mods in a directory and return their details
const scanModsInDirectory = async (directory, enabled) => {
  const mods = [];
  try {
    const modFolders = await fs.readdir(directory);
    for (const folder of modFolders) {
      const folderPath = path.join(directory, folder);
      const stats = await fs.stat(folderPath);
      if (stats.isDirectory()) {
        const modInfoResult = await findModInfoFile(folderPath);
        if (modInfoResult) {
          const modInfo = await parseModInfo(modInfoResult);
          if (modInfo) {
            // Use the appropriate path for icon and localization based on structure
            const basePath = modInfoResult.inSubfolder
              ? path.join(folderPath, modInfoResult.subfolderName)
              : folderPath;

            const localization = await parseModInfoText(basePath);
            const iconPath = await findModIcon(basePath);

            const name = modInfo.Properties.Name;
            const description = modInfo.Properties.Description;

            // Use localized text if available, otherwise use the original text
            const localizedName = localization[name] || name;
            const localizedDescription =
              localization[description] || description;

            mods.push({
              folder,
              id: modInfo._id,
              version: modInfo._version,
              name: modInfo.ModManager?.Name || localizedName,
              description:
                modInfo.ModManager?.Description || localizedDescription,
              authors: modInfo.Properties.Authors,
              affectsSavedGames: modInfo.Properties.AffectsSavedGames === "1",
              icon: iconPath,
              enabled,
              inSubfolder: modInfoResult.inSubfolder,
              subfolderName: modInfoResult.subfolderName,
            });
          }
        }
      }
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return mods;
};

// Expose APIs to the renderer process
contextBridge.exposeInMainWorld("APP_CONSTANTS", APP_CONSTANTS);
contextBridge.exposeInMainWorld("api", {
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),

  path: {
    basename: (filepath) => path.basename(filepath),
    dirname: (filepath) => path.dirname(filepath),
    join: (...paths) => path.join(...paths),
  },

  getModsPath,
  getUsername: () => getUsername(),

  scanMods: async () => {
    try {
      const modsPath = await getModsPath();
      const disabledModsPath = await getDisabledModsPath();

      const enabledMods = await scanModsInDirectory(modsPath, true);
      const disabledMods = await scanModsInDirectory(disabledModsPath, false);

      return [...enabledMods, ...disabledMods];
    } catch (error) {
      console.error("Error scanning mods:", error);
      throw error;
    }
  },

  checkModExists: async (folderName) => {
    try {
      const modsPath = await getModsPath();
      const disabledModsPath = await getDisabledModsPath();

      // Check both enabled and disabled mods folders
      const modPath = path.join(modsPath, folderName);
      const disabledModPath = path.join(disabledModsPath, folderName);

      const exists = {
        exists: false,
        location: null,
        isEnabled: false,
      };

      try {
        await fs.access(modPath);
        exists.exists = true;
        exists.location = modPath;
        exists.isEnabled = true;
      } catch {
        try {
          await fs.access(disabledModPath);
          exists.exists = true;
          exists.location = disabledModPath;
          exists.isEnabled = false;
        } catch {
          // Mod doesn't exist in either location
        }
      }

      return exists;
    } catch (error) {
      console.error("Error checking if mod exists:", error);
      throw error;
    }
  },

  handleArchiveFile: async (fileBuffer, fileName) => {
    try {
      // Get the name without extension
      const modName = path.basename(fileName, path.extname(fileName));
      const modsPath = await getModsPath();
      const modPath = path.join(modsPath, modName);
      const archivePath = path.join(os.tmpdir(), fileName);

      // Write the buffer to a temporary file
      await fs.writeFile(archivePath, Buffer.from(fileBuffer));

      // Extract directly to the mods folder
      await ArchiveHandler.extractArchive(archivePath, modPath);

      // Delete the temporary archive file
      await fs.unlink(archivePath);

      return {
        modPath,
        cleanup: () => {}, // No cleanup needed since we extracted directly
      };
    } catch (error) {
      throw new Error(`Archive extraction failed: ${error.message}`);
    }
  },

  readFile: async (filePath) => {
    const content = await fs.readFile(filePath);
    return content;
  },

  readDirectory: async (dirPath) => {
    const files = await fs.readdir(dirPath);
    const entries = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          path: filePath,
        };
      })
    );
    return entries;
  },

  pathBasename: (filepath) => path.basename(filepath),

  validateAndInstallMod: async (data) => {
    try {
      const modsPath = await getModsPath();
      const modPath = path.join(modsPath, data.folderName);

      // Check if the mod already exists
      try {
        await fs.access(modPath);
        throw new Error("Mod already exists");
      } catch (error) {
        if (error.message !== "Mod already exists" && error.code !== "ENOENT") {
          throw error;
        }
      }

      // Create the mod directory
      await fs.mkdir(modPath, { recursive: true });

      // Write all files
      for (const fileData of data.files) {
        const filePath = path.join(modPath, fileData.path);
        if (path.dirname(fileData.path) !== ".") {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
        }
        const buffer = await fileData.file.arrayBuffer();
        await fs.writeFile(filePath, Buffer.from(buffer));
      }

      return true;
    } catch (error) {
      console.error("Error validating and installing mod:", error);
      throw error;
    }
  },

  toggleMod: async (modName, currentlyEnabled) => {
    try {
      const modsPath = await getModsPath();
      const disabledModsPath = await getDisabledModsPath();

      const sourcePath = currentlyEnabled
        ? path.join(modsPath, modName)
        : path.join(disabledModsPath, modName);

      const destPath = currentlyEnabled
        ? path.join(disabledModsPath, modName)
        : path.join(modsPath, modName);

      await fs.access(sourcePath); // Verify source exists
      await fs.mkdir(path.dirname(destPath), { recursive: true }); // Ensure destination exists
      await fs.rename(sourcePath, destPath);

      return true;
    } catch (error) {
      console.error("Error toggling mod:", error);
      throw error;
    }
  },

  deleteMod: async (modName, isEnabled) => {
    try {
      const modsPath = await getModsPath();
      const disabledModsPath = await getDisabledModsPath();

      const modPath = isEnabled
        ? path.join(modsPath, modName)
        : path.join(disabledModsPath, modName);

      await fs.access(modPath); // Verify the path exists
      await fs.rm(modPath, { recursive: true, force: true });

      return true;
    } catch (error) {
      console.error("Error deleting mod:", error);
      throw error;
    }
  },

  openModsFolder: async () => {
    const modsPath = await getModsPath();
    shell.openPath(modsPath);
  },

  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  getCustomModsPath: () => ipcRenderer.invoke("get-custom-mods-path"),
  setCustomModsPath: (path) => ipcRenderer.invoke("set-custom-mods-path", path),
});
