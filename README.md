# Conexion's Civilization VII Mod Manager

![License](https://img.shields.io/github/license/CivConexion/civ-7-mod-manager)
![Version](https://img.shields.io/github/v/release/CivConexion/civ-7-mod-manager?include_prereleases&label=version)

> ⚠️ **BETA SOFTWARE**: This is a pre-release version for testing purposes. Please report any issues you encounter.

A simple, lightweight mod manager for Civilization VII that allows you to easily install, enable, disable, and manage your mods.

## Features

- 📦 Easy mod installation via drag-and-drop
- 🔄 Enable/disable mods without deleting them
- 🗑️ Simple mod removal
- 📂 Custom mods directory support
- 🎮 Compatible with Steam version of Civilization VII

## Installation

### From Releases
1. Go to the [Releases](https://github.com/CivConexion/civ-7-mod-manager/releases) page
2. Download the latest version for your platform
3. Run the installer (See below if you are on Mac)

### ⚠️ macOS Installation Notes
Due to macOS "security features" (They want me to pay $99/year to 'sign' the app), you may see a message that the app is "damaged" or "can't be opened". To resolve this:

1. After downloading and installing the app, open Terminal
2. Run this command to remove the quarantine attribute:
   ```bash
   xattr -d com.apple.quarantine /Applications/Conexion\'s\ Civilization\ VII\ Mod\ Manager.app
   ```

### From Source
```bash
# Clone the repository
git clone https://github.com/CivConexion/civ-7-mod-manager.git

# Navigate to the directory
cd civ-7-mod-manager

# Install dependencies
npm install

# Run the application
npm start
```

## Usage

1. Launch the application
2. Your mods will automatically be detected from the default Civilization VII mods directory
3. To install a new mod:
   - Extract the mod archive (zip/rar/7z) to a folder
   - Drag and drop the folder onto the drop zone in the application
4. Use the toggle button to enable/disable mods
5. Use the delete button (✕) to remove mods completely

## Development

```bash
# Run in development mode
npm start

# Build for your platform
npm run build
```

## Mod Manager Enhancements

The mod manager provides some additional features for mod creators to enhance their mods' presentation:

### Current Features
- **Custom Mod Icons**: Place an `icon.png` (or `icon.jpg`, etc.) file in your mod's root folder next to the `.modinfo` file to display a custom icon in the manager. Icons are sized to 48x48 pixels.

### Planned Features
- Load order management
- Mod categories and tags
- Mod update detection
- Linking to and using associated icons from associated mod download pages (Permission pending)

> 📝 **Note for Mod Creators**: Any enhancements are optional and won't affect your mod's functionality in the game. They only enhance how your mod appears and behaves in the mod manager.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GNU General Public License v2.0 or later - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- (Reluctantly) Built with [Electron](https://www.electronjs.org/) - The easiest way to build cross-platform desktop applications

## Support

If you encounter any issues, please [open an issue](https://github.com/CivConexion/civ-7-mod-manager/issues) on GitHub.

---

<br/>
<p align="center">Made with ❤️ for the Civilization community</p>