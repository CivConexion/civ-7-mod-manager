exports.APP_CONSTANTS = {
  FOLDERS: {
    MODS: "Mods",
    DISABLED_MODS: "DisabledMods",
  },

  MOD_STATES: {
    ENABLED: "enabled",
    DISABLED: "disabled",
  },

  DATA_ATTRIBUTES: {
    MOD_ID: "data-mod-id",
    MOD_FOLDER: "data-mod-folder",
    MOD_STATE: "data-mod-state",
    ACTION_TYPE: "data-action-type",
  },

  ACTIONS: {
    TOGGLE: "toggle",
    DELETE: "delete",
  },

  NOTIFICATION_TYPES: {
    SUCCESS: "success",
    ERROR: "error",
    INFO: "info",
  },

  MESSAGES: {
    MOD_INSTALLED: (modName) => `Mod installed successfully: ${modName}`,
    INSTALLATION_CANCELLED: "Installation cancelled",
    ERROR_REMOVING_EXISTING: "Failed to remove existing mod",
    MOD_ENABLED: "Mod enabled successfully",
    MOD_DISABLED: "Mod disabled successfully",
    MOD_DELETED: "Mod deleted successfully",
    CONFIRM_DELETE: (modName) =>
      `Are you sure you want to delete "${modName}"?\n\nThis action cannot be undone.`,
    ERROR_NO_MODINFO: "No .modinfo file found in folder or immediate subfolder",
    ERROR_EXTRACT_FIRST:
      "Please extract the archive before dropping. Only folders are supported.",
    ERROR_FOLDER_ONLY: "Please drop a folder, not a file",
  },

  SUPPORTED_ARCHIVES: [".zip", ".rar", ".7z"],

  TIMEOUTS: {
    NOTIFICATION: 3000,
  },

  DROP_ZONE: {
    MESSAGES: {
      DEFAULT: "Drop mod folder here to install",
      EXTRACT_FIRST: "Please extract your ZIP / 7z / RAR file before dragging",
    },
  },

  NOTIFICATION: {
    TYPES: {
      SUCCESS: "success",
      ERROR: "error",
      INFO: "info",
    },
    DURATION: 3000,
  },

  EVENTS: {
    DRAG: {
      ENTER: "dragenter",
      OVER: "dragover",
      LEAVE: "dragleave",
      DROP: "drop",
    },
  },
};
