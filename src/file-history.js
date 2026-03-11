/**
 * Aria File History System
 * 
 * Tracks all file operations (create, edit, delete) with:
 * - Full content snapshots before/after
 * - Timestamps and operation metadata
 * - Undo/redo capability
 * - Timeline view
 * 
 * Similar to VS Code's Local History or git's reflog
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// History storage directory
const HISTORY_DIR = path.join(process.env.HOME || '/tmp', '.aria', 'history');

// Ensure history directory exists
function ensureHistoryDir() {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

// Generate a unique ID for each operation
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// Hash content for deduplication
function hashContent(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

// Get history file path for a given file
function getHistoryPath(filePath) {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  return path.join(HISTORY_DIR, `${hash}.json`);
}

// Get content storage path
function getContentPath(contentHash) {
  const contentDir = path.join(HISTORY_DIR, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  return path.join(contentDir, `${contentHash}.txt`);
}

// Store content blob (deduplicated)
function storeContent(content) {
  if (!content) return null;
  const hash = hashContent(content);
  const contentPath = getContentPath(hash);
  if (!fs.existsSync(contentPath)) {
    fs.writeFileSync(contentPath, content, 'utf-8');
  }
  return hash;
}

// Retrieve content blob
function retrieveContent(hash) {
  if (!hash) return null;
  const contentPath = getContentPath(hash);
  if (fs.existsSync(contentPath)) {
    return fs.readFileSync(contentPath, 'utf-8');
  }
  return null;
}

/**
 * FileHistory class - manages history for all files
 */
class FileHistory {
  constructor() {
    ensureHistoryDir();
    this.undoStack = []; // Stack of operations that can be undone
    this.redoStack = []; // Stack of operations that can be redone
  }

  /**
   * Load history for a specific file
   */
  loadFileHistory(filePath) {
    const historyPath = getHistoryPath(filePath);
    if (fs.existsSync(historyPath)) {
      try {
        return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      } catch {
        return { filePath, entries: [] };
      }
    }
    return { filePath, entries: [] };
  }

  /**
   * Save history for a specific file
   */
  saveFileHistory(filePath, history) {
    const historyPath = getHistoryPath(filePath);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  /**
   * Record a file operation
   */
  record(operation) {
    const {
      type,           // 'create' | 'edit' | 'delete' | 'rename'
      filePath,
      oldContent,
      newContent,
      description,    // Human-readable description
      source,         // 'aria' | 'user' | 'external'
    } = operation;

    const entry = {
      id: generateId(),
      type,
      filePath,
      timestamp: new Date().toISOString(),
      description: description || `${type} ${path.basename(filePath)}`,
      source: source || 'aria',
      beforeHash: storeContent(oldContent),
      afterHash: storeContent(newContent),
      beforeSize: oldContent?.length || 0,
      afterSize: newContent?.length || 0,
    };

    // Load and update file history
    const history = this.loadFileHistory(filePath);
    history.entries.push(entry);
    
    // Keep only last 100 entries per file
    if (history.entries.length > 100) {
      history.entries = history.entries.slice(-100);
    }
    
    this.saveFileHistory(filePath, history);

    // Add to undo stack
    this.undoStack.push(entry);
    this.redoStack = []; // Clear redo stack on new operation

    // Keep undo stack manageable
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }

    return entry;
  }

  /**
   * Record file creation
   */
  recordCreate(filePath, content, description) {
    return this.record({
      type: 'create',
      filePath,
      oldContent: null,
      newContent: content,
      description: description || `Created ${path.basename(filePath)}`,
      source: 'aria',
    });
  }

  /**
   * Record file edit
   */
  recordEdit(filePath, oldContent, newContent, description) {
    return this.record({
      type: 'edit',
      filePath,
      oldContent,
      newContent,
      description: description || `Edited ${path.basename(filePath)}`,
      source: 'aria',
    });
  }

  /**
   * Record file deletion
   */
  recordDelete(filePath, oldContent, description) {
    return this.record({
      type: 'delete',
      filePath,
      oldContent,
      newContent: null,
      description: description || `Deleted ${path.basename(filePath)}`,
      source: 'aria',
    });
  }

  /**
   * Get timeline for a file
   */
  getTimeline(filePath, limit = 20) {
    const history = this.loadFileHistory(filePath);
    return history.entries.slice(-limit).reverse().map(entry => ({
      ...entry,
      beforeContent: retrieveContent(entry.beforeHash),
      afterContent: retrieveContent(entry.afterHash),
    }));
  }

  /**
   * Get recent operations across all files
   */
  getRecentOperations(limit = 20) {
    const allEntries = [];
    
    try {
      const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const history = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf-8'));
          allEntries.push(...history.entries.map(e => ({ ...e, filePath: history.filePath })));
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      // History dir doesn't exist yet
    }

    return allEntries
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Undo the last operation
   */
  undo() {
    if (this.undoStack.length === 0) {
      return { success: false, message: 'Nothing to undo' };
    }

    const entry = this.undoStack.pop();
    const beforeContent = retrieveContent(entry.beforeHash);

    try {
      if (entry.type === 'create') {
        // Undo create = delete the file
        if (fs.existsSync(entry.filePath)) {
          fs.unlinkSync(entry.filePath);
        }
      } else if (entry.type === 'delete') {
        // Undo delete = restore the file
        const dir = path.dirname(entry.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(entry.filePath, beforeContent || '', 'utf-8');
      } else if (entry.type === 'edit') {
        // Undo edit = restore previous content
        fs.writeFileSync(entry.filePath, beforeContent || '', 'utf-8');
      }

      this.redoStack.push(entry);

      return {
        success: true,
        message: `Undid: ${entry.description}`,
        entry,
      };
    } catch (e) {
      return { success: false, message: `Undo failed: ${e.message}` };
    }
  }

  /**
   * Redo the last undone operation
   */
  redo() {
    if (this.redoStack.length === 0) {
      return { success: false, message: 'Nothing to redo' };
    }

    const entry = this.redoStack.pop();
    const afterContent = retrieveContent(entry.afterHash);

    try {
      if (entry.type === 'create' || entry.type === 'edit') {
        const dir = path.dirname(entry.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(entry.filePath, afterContent || '', 'utf-8');
      } else if (entry.type === 'delete') {
        if (fs.existsSync(entry.filePath)) {
          fs.unlinkSync(entry.filePath);
        }
      }

      this.undoStack.push(entry);

      return {
        success: true,
        message: `Redid: ${entry.description}`,
        entry,
      };
    } catch (e) {
      return { success: false, message: `Redo failed: ${e.message}` };
    }
  }

  /**
   * Restore a file to a specific point in history
   */
  restoreToPoint(filePath, entryId) {
    const history = this.loadFileHistory(filePath);
    const entry = history.entries.find(e => e.id === entryId);

    if (!entry) {
      return { success: false, message: 'History entry not found' };
    }

    const content = retrieveContent(entry.afterHash);

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Record this restore as a new operation
      let currentContent = null;
      if (fs.existsSync(filePath)) {
        currentContent = fs.readFileSync(filePath, 'utf-8');
      }

      fs.writeFileSync(filePath, content || '', 'utf-8');

      this.recordEdit(filePath, currentContent, content, `Restored to ${entry.timestamp}`);

      return {
        success: true,
        message: `Restored ${path.basename(filePath)} to ${entry.timestamp}`,
        entry,
      };
    } catch (e) {
      return { success: false, message: `Restore failed: ${e.message}` };
    }
  }

  /**
   * Get diff between two history points
   */
  getDiff(filePath, fromId, toId) {
    const history = this.loadFileHistory(filePath);
    const fromEntry = history.entries.find(e => e.id === fromId);
    const toEntry = history.entries.find(e => e.id === toId);

    if (!fromEntry || !toEntry) {
      return null;
    }

    return {
      from: {
        ...fromEntry,
        content: retrieveContent(fromEntry.afterHash),
      },
      to: {
        ...toEntry,
        content: retrieveContent(toEntry.afterHash),
      },
    };
  }

  /**
   * Get undo/redo status
   */
  getStatus() {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      lastUndo: this.undoStack[this.undoStack.length - 1] || null,
      lastRedo: this.redoStack[this.redoStack.length - 1] || null,
    };
  }

  /**
   * Clear all history (use with caution)
   */
  clearAll() {
    try {
      fs.rmSync(HISTORY_DIR, { recursive: true, force: true });
      ensureHistoryDir();
      this.undoStack = [];
      this.redoStack = [];
      return { success: true, message: 'History cleared' };
    } catch (e) {
      return { success: false, message: `Clear failed: ${e.message}` };
    }
  }
}

// Singleton instance
const fileHistory = new FileHistory();

module.exports = {
  FileHistory,
  fileHistory,
  HISTORY_DIR,
};
