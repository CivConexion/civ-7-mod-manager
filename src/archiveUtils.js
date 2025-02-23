const { exec } = require("child_process");
const util = require("util");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const execPromise = util.promisify(exec);

class ArchiveHandler {
  static async checkAvailableCommands() {
    const commands = {
      win32: {
        powershell: 'powershell -Command "Get-Command Expand-Archive"',
        "7z": "7z --help",
        winrar: "winrar /?",
      },
      darwin: {
        unzip: "unzip -v",
        "7z": "7z --help",
        tar: "tar --version",
      },
      linux: {
        unzip: "unzip -v",
        "7z": "7z --help",
        tar: "tar --version",
      },
    };

    const platform = os.platform();
    const availableCommands = [];

    const platformCommands = commands[platform] || {};

    for (const [cmd, testCmd] of Object.entries(platformCommands)) {
      try {
        await execPromise(testCmd);
        availableCommands.push(cmd);
      } catch (error) {
        console.log(`Command ${cmd} not available`);
      }
    }

    return availableCommands;
  }

  static async extractArchive(archivePath, outputPath) {
    const platform = os.platform();
    const availableCommands = await this.checkAvailableCommands();
    const extension = path.extname(archivePath).toLowerCase();

    let command;

    if (platform === "win32") {
      if (extension === ".zip" && availableCommands.includes("powershell")) {
        const escapedArchivePath = archivePath.replace(/'/g, "''");
        const escapedOutputPath = outputPath.replace(/'/g, "''");
        command = `powershell -Command "& { Expand-Archive -LiteralPath '${escapedArchivePath}' -DestinationPath '${escapedOutputPath}' -Force }"`;
      } else if (availableCommands.includes("7z")) {
        command = `7z x "${archivePath}" -o"${outputPath}" -y`;
      } else if (availableCommands.includes("winrar")) {
        command = `winrar x "${archivePath}" "${outputPath}"`;
      }
    } else {
      if (extension === ".zip" && availableCommands.includes("unzip")) {
        command = `unzip -o "${archivePath}" -d "${outputPath}"`;
      } else if (availableCommands.includes("7z")) {
        command = `7z x "${archivePath}" -o"${outputPath}" -y`;
      } else if (extension === ".tar.gz" && availableCommands.includes("tar")) {
        command = `tar -xzf "${archivePath}" -C "${outputPath}"`;
      }
    }

    if (!command) {
      let errorMessage = "No suitable extraction tool found.\n\n";
      if (platform === "win32") {
        errorMessage +=
          "For .zip files, Windows built-in support should work.\n";
        errorMessage += "For other formats, please install 7-Zip or WinRAR.";
      } else {
        errorMessage += "Please install one of the following:\n";
        errorMessage += "• unzip (for .zip files)\n";
        errorMessage += "• 7z (for multiple archive formats)\n";
        errorMessage += "• tar (for .tar.gz files)";
      }
      throw new Error(errorMessage);
    }

    try {
      console.log(`Executing command: ${command}`);
      const { stdout, stderr } = await execPromise(command);
      if (stderr) console.warn("Extraction stderr:", stderr);
      if (stdout) console.log("Extraction stdout:", stdout);

      // Check for single top-level directory
      const entries = await fs.readdir(outputPath, { withFileTypes: true });
      if (entries.length === 1 && entries[0].isDirectory()) {
        const topLevelDir = path.join(outputPath, entries[0].name);
        const topLevelEntries = await fs.readdir(topLevelDir);

        // If the top-level directory contains files, move them up
        if (topLevelEntries.length > 0) {
          for (const entry of topLevelEntries) {
            const sourcePath = path.join(topLevelDir, entry);
            const destPath = path.join(outputPath, entry);
            await fs.rename(sourcePath, destPath);
          }
          await fs.rmdir(topLevelDir);
        }
      }

      return outputPath;
    } catch (error) {
      console.error("Extraction error:", error);
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  static async validateArchive(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const supportedFormats = [".zip", ".7z", ".rar", ".tar.gz"];

    if (!supportedFormats.includes(extension)) {
      throw new Error(`Unsupported archive format: ${extension}`);
    }

    const platform = os.platform();
    const availableCommands = await this.checkAvailableCommands();

    if (
      platform === "win32" &&
      extension === ".zip" &&
      availableCommands.includes("powershell")
    ) {
      return true;
    }

    if (
      !availableCommands.some((cmd) =>
        ["7z", "winrar", "unzip", "tar"].includes(cmd)
      )
    ) {
      throw new Error("No archive extraction tools available");
    }

    return true;
  }
}

module.exports = ArchiveHandler;
