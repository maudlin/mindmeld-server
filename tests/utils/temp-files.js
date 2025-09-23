/**
 * Test utilities for managing temporary files and cleanup
 * 
 * Ensures all test-generated files are created in temporary directories
 * and properly cleaned up after tests complete.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class TempFileManager {
  constructor() {
    this.tempDirs = new Set();
    this.tempFiles = new Set();
    this.isSetupComplete = false;
  }

  /**
   * Create a temporary directory for test files
   * @param {string} prefix - Prefix for the temp directory name
   * @returns {Promise<string>} Path to the temporary directory
   */
  async createTempDir(prefix = 'mindmeld-test') {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
    this.tempDirs.add(tempDir);
    return tempDir;
  }

  /**
   * Create a temporary file path (doesn't create the file)
   * @param {string} filename - Name of the file
   * @param {string} tempDir - Optional temp directory (creates one if not provided)
   * @returns {Promise<string>} Path to the temporary file
   */
  async createTempFilePath(filename, tempDir = null) {
    if (!tempDir) {
      tempDir = await this.createTempDir();
    }
    const filePath = path.join(tempDir, filename);
    this.tempFiles.add(filePath);
    return filePath;
  }

  /**
   * Create a temporary file with content
   * @param {string} filename - Name of the file
   * @param {string|Buffer} content - Content to write
   * @param {string} tempDir - Optional temp directory
   * @returns {Promise<string>} Path to the created file
   */
  async createTempFile(filename, content, tempDir = null) {
    const filePath = await this.createTempFilePath(filename, tempDir);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Generate a unique filename with timestamp (like the export/import scripts do)
   * @param {string} prefix - Prefix for the filename
   * @param {string} extension - File extension
   * @returns {string} Unique filename
   */
  generateUniqueFilename(prefix, extension) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .split('.')[0] + 'Z';
    return `${prefix}-${timestamp}.${extension}`;
  }

  /**
   * Create a temporary export file path (mimics the export script behavior)
   * @param {string} format - Export format (json, csv, etc.)
   * @param {string} tempDir - Optional temp directory
   * @returns {Promise<string>} Path to the temporary export file
   */
  async createTempExportPath(format = 'json', tempDir = null) {
    const filename = this.generateUniqueFilename('test-export', format);
    return await this.createTempFilePath(filename, tempDir);
  }

  /**
   * Create a temporary backup file path (mimics the import script behavior)
   * @param {string} tempDir - Optional temp directory
   * @returns {Promise<string>} Path to the temporary backup file
   */
  async createTempBackupPath(tempDir = null) {
    const filename = this.generateUniqueFilename('test-backup', 'sqlite');
    return await this.createTempFilePath(filename, tempDir);
  }

  /**
   * Clean up all temporary files and directories
   * @returns {Promise<void>}
   */
  async cleanup() {
    const errors = [];

    // Clean up individual files first
    for (const filePath of this.tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          errors.push(`Failed to delete file ${filePath}: ${error.message}`);
        }
      }
    }

    // Clean up directories
    for (const dirPath of this.tempDirs) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') {
          errors.push(`Failed to delete directory ${dirPath}: ${error.message}`);
        }
      }
    }

    // Clear tracking sets
    this.tempFiles.clear();
    this.tempDirs.clear();

    if (errors.length > 0) {
      console.warn('Some temporary files could not be cleaned up:', errors);
    }
  }

  /**
   * Register file for cleanup (for files created outside this manager)
   * @param {string} filePath - Path to the file to track
   */
  registerFileForCleanup(filePath) {
    this.tempFiles.add(filePath);
  }

  /**
   * Register directory for cleanup (for directories created outside this manager)
   * @param {string} dirPath - Path to the directory to track
   */
  registerDirForCleanup(dirPath) {
    this.tempDirs.add(dirPath);
  }

  /**
   * Check if a path is in a temporary directory
   * @param {string} filePath - Path to check
   * @returns {boolean} True if path is in a temp directory
   */
  isInTempDir(filePath) {
    const tempDir = os.tmpdir();
    const resolved = path.resolve(filePath);
    return resolved.startsWith(path.resolve(tempDir));
  }
}

// Global instance for convenience
const tempFileManager = new TempFileManager();

// Jest setup/teardown helpers
const setupTempFiles = () => {
  // Nothing to do during setup currently
};

const cleanupTempFiles = async () => {
  await tempFileManager.cleanup();
};

/**
 * Clean up stray test files that might have been created in the project directory
 * This is a safety net for files that weren't properly tracked
 */
const cleanupStrayTestFiles = async () => {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    // Define patterns for test files that shouldn't be in project root
    const strayPatterns = [
      /^mindmeld-export-\d{4}-\d{2}-\d{2}-\d+Z?\.json$/,
      /^pre-import-\d{4}-\d{2}-\d{2}-\d+Z?\.sqlite$/,
      /^test-export-\d{4}-\d{2}-\d{2}-\d+Z?\.\w+$/,
      /^test-backup-\d{4}-\d{2}-\d{2}-\d+Z?\.\w+$/
    ];
    
    const projectRoot = process.cwd();
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    
    const filesToClean = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const filename = entry.name;
        if (strayPatterns.some(pattern => pattern.test(filename))) {
          filesToClean.push(path.join(projectRoot, filename));
        }
      }
    }
    
    // Clean up identified files
    const errors = [];
    for (const filePath of filesToClean) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up stray test file: ${path.basename(filePath)}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          errors.push(`Failed to clean up ${filePath}: ${error.message}`);
        }
      }
    }
    
    if (errors.length > 0) {
      console.warn('Some stray test files could not be cleaned up:', errors);
    }
  } catch (error) {
    console.warn('Error during stray file cleanup:', error.message);
  }
};

/**
 * Clean up all test safety backups to prevent accumulation
 * Removes all safety backup files created by tests immediately
 */
const cleanupOldTestBackups = async () => {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    
    // Check if backup directory exists
    try {
      await fs.access(backupDir);
    } catch (error) {
      // Backup directory doesn't exist, nothing to clean
      return;
    }
    
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    
    const filesToClean = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('safety-backup-')) {
        const filePath = path.join(backupDir, entry.name);
        filesToClean.push(filePath);
      }
    }
    
    // Clean up old safety backups
    const errors = [];
    for (const filePath of filesToClean) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up test safety backup: ${path.basename(filePath)}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          errors.push(`Failed to clean up ${filePath}: ${error.message}`);
        }
      }
    }
    
    if (errors.length > 0) {
        console.warn('Some test safety backups could not be cleaned up:', errors);
    }
    
    if (filesToClean.length > 0) {
      console.log(`Cleaned up ${filesToClean.length} test safety backup files`);
    }
  } catch (error) {
    console.warn('Error during backup cleanup:', error.message);
  }
};

module.exports = {
  TempFileManager,
  tempFileManager,
  setupTempFiles,
  cleanupTempFiles,
  cleanupStrayTestFiles,
  cleanupOldTestBackups
};
