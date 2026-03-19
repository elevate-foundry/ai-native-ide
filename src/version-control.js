/**
 * Aria Version Control System (AVCS)
 * 
 * A git-like version control system for Aria to track all file changes.
 * 
 * Features:
 * - Content-addressable storage (SHA-256 hashes)
 * - Commits with messages and timestamps
 * - Branches and merging
 * - Diff generation
 * - Full history traversal
 * - Rollback to any commit
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AVCS_DIR = '.aria';
const OBJECTS_DIR = 'objects';
const REFS_DIR = 'refs';
const HEAD_FILE = 'HEAD';
const INDEX_FILE = 'index';

class AriaVersionControl {
  constructor(workdir) {
    this.workdir = workdir;
    this.avcsDir = path.join(workdir, AVCS_DIR);
    this.objectsDir = path.join(this.avcsDir, OBJECTS_DIR);
    this.refsDir = path.join(this.avcsDir, REFS_DIR);
    this.headFile = path.join(this.avcsDir, HEAD_FILE);
    this.indexFile = path.join(this.avcsDir, INDEX_FILE);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  init() {
    if (fs.existsSync(this.avcsDir)) {
      return { success: true, message: 'Already initialized', path: this.avcsDir };
    }

    fs.mkdirSync(this.objectsDir, { recursive: true });
    fs.mkdirSync(this.refsDir, { recursive: true });
    fs.writeFileSync(this.headFile, 'ref: refs/main\n');
    fs.writeFileSync(this.indexFile, JSON.stringify({ staged: {} }));
    fs.writeFileSync(path.join(this.refsDir, 'main'), '');

    return { success: true, message: 'Initialized AVCS repository', path: this.avcsDir };
  }

  isInitialized() {
    return fs.existsSync(this.avcsDir);
  }

  // ============================================================================
  // Object Storage (content-addressable)
  // ============================================================================

  hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  writeObject(content) {
    const hash = this.hash(content);
    const objectPath = path.join(this.objectsDir, hash.slice(0, 2), hash.slice(2));
    
    if (!fs.existsSync(objectPath)) {
      fs.mkdirSync(path.dirname(objectPath), { recursive: true });
      fs.writeFileSync(objectPath, content);
    }
    
    return hash;
  }

  readObject(hash) {
    const objectPath = path.join(this.objectsDir, hash.slice(0, 2), hash.slice(2));
    if (!fs.existsSync(objectPath)) return null;
    return fs.readFileSync(objectPath, 'utf-8');
  }

  // ============================================================================
  // Index (staging area)
  // ============================================================================

  getIndex() {
    if (!fs.existsSync(this.indexFile)) return { staged: {} };
    return JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
  }

  saveIndex(index) {
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
  }

  stage(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
    const relativePath = path.relative(this.workdir, fullPath);
    
    if (!fs.existsSync(fullPath)) {
      // Stage deletion
      const index = this.getIndex();
      index.staged[relativePath] = { deleted: true };
      this.saveIndex(index);
      return { success: true, action: 'staged deletion', path: relativePath };
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const hash = this.writeObject(content);
    
    const index = this.getIndex();
    index.staged[relativePath] = { hash, mode: 'file' };
    this.saveIndex(index);

    return { success: true, action: 'staged', path: relativePath, hash: hash.slice(0, 8) };
  }

  unstage(filePath) {
    const relativePath = path.relative(this.workdir, 
      path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath));
    
    const index = this.getIndex();
    delete index.staged[relativePath];
    this.saveIndex(index);

    return { success: true, action: 'unstaged', path: relativePath };
  }

  status() {
    const index = this.getIndex();
    const staged = Object.keys(index.staged);
    const headCommit = this.getHeadCommit();
    
    // Get current tree from HEAD
    let headTree = {};
    if (headCommit) {
      headTree = JSON.parse(this.readObject(headCommit.tree) || '{}');
    }

    // Find modified/untracked files
    const modified = [];
    const untracked = [];
    
    this._walkDir(this.workdir, (filePath) => {
      const relativePath = path.relative(this.workdir, filePath);
      if (relativePath.startsWith('.aria') || relativePath.startsWith('.git')) return;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const hash = this.hash(content);
      
      if (headTree[relativePath]) {
        if (headTree[relativePath].hash !== hash && !index.staged[relativePath]) {
          modified.push(relativePath);
        }
      } else if (!index.staged[relativePath]) {
        untracked.push(relativePath);
      }
    });

    return {
      branch: this.getCurrentBranch(),
      staged,
      modified,
      untracked,
      clean: staged.length === 0 && modified.length === 0,
    };
  }

  _walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          this._walkDir(fullPath, callback);
        }
      } else {
        callback(fullPath);
      }
    }
  }

  // ============================================================================
  // Commits
  // ============================================================================

  commit(message) {
    const index = this.getIndex();
    if (Object.keys(index.staged).length === 0) {
      return { success: false, error: 'Nothing staged to commit' };
    }

    // Build tree from HEAD + staged changes
    const headCommit = this.getHeadCommit();
    let tree = {};
    
    if (headCommit) {
      tree = JSON.parse(this.readObject(headCommit.tree) || '{}');
    }

    // Apply staged changes
    for (const [filePath, entry] of Object.entries(index.staged)) {
      if (entry.deleted) {
        delete tree[filePath];
      } else {
        tree[filePath] = entry;
      }
    }

    // Write tree object
    const treeContent = JSON.stringify(tree);
    const treeHash = this.writeObject(treeContent);

    // Create commit object
    const commit = {
      tree: treeHash,
      parent: headCommit ? this.getHead() : null,
      message,
      timestamp: new Date().toISOString(),
      author: 'Aria',
    };

    const commitContent = JSON.stringify(commit);
    const commitHash = this.writeObject(commitContent);

    // Update HEAD
    this.setHead(commitHash);

    // Clear index
    this.saveIndex({ staged: {} });

    return {
      success: true,
      hash: commitHash.slice(0, 8),
      message,
      filesChanged: Object.keys(index.staged).length,
    };
  }

  // ============================================================================
  // Refs and HEAD
  // ============================================================================

  getHead() {
    if (!fs.existsSync(this.headFile)) return null;
    const head = fs.readFileSync(this.headFile, 'utf-8').trim();
    
    if (head.startsWith('ref: ')) {
      const refPath = path.join(this.avcsDir, head.slice(5));
      if (!fs.existsSync(refPath)) return null;
      return fs.readFileSync(refPath, 'utf-8').trim() || null;
    }
    
    return head || null;
  }

  setHead(commitHash) {
    const head = fs.readFileSync(this.headFile, 'utf-8').trim();
    
    if (head.startsWith('ref: ')) {
      const refPath = path.join(this.avcsDir, head.slice(5));
      fs.writeFileSync(refPath, commitHash);
    } else {
      fs.writeFileSync(this.headFile, commitHash);
    }
  }

  getCurrentBranch() {
    if (!fs.existsSync(this.headFile)) return null;
    const head = fs.readFileSync(this.headFile, 'utf-8').trim();
    
    if (head.startsWith('ref: refs/')) {
      return head.slice(10);
    }
    
    return null; // Detached HEAD
  }

  getHeadCommit() {
    const hash = this.getHead();
    if (!hash) return null;
    
    const content = this.readObject(hash);
    if (!content) return null;
    
    return JSON.parse(content);
  }

  // ============================================================================
  // Branches
  // ============================================================================

  createBranch(name) {
    const refPath = path.join(this.refsDir, name);
    if (fs.existsSync(refPath)) {
      return { success: false, error: `Branch '${name}' already exists` };
    }

    const head = this.getHead() || '';
    fs.writeFileSync(refPath, head);

    return { success: true, branch: name, at: head.slice(0, 8) || '(empty)' };
  }

  checkout(branchOrCommit) {
    // Check if it's a branch
    const refPath = path.join(this.refsDir, branchOrCommit);
    
    if (fs.existsSync(refPath)) {
      // It's a branch
      fs.writeFileSync(this.headFile, `ref: refs/${branchOrCommit}\n`);
      const commitHash = fs.readFileSync(refPath, 'utf-8').trim();
      
      if (commitHash) {
        this._restoreTree(commitHash);
      }
      
      return { success: true, branch: branchOrCommit };
    }

    // Check if it's a commit hash
    const commit = this.readObject(branchOrCommit);
    if (commit) {
      fs.writeFileSync(this.headFile, branchOrCommit);
      this._restoreTree(branchOrCommit);
      return { success: true, commit: branchOrCommit.slice(0, 8), detached: true };
    }

    return { success: false, error: `Branch or commit '${branchOrCommit}' not found` };
  }

  _restoreTree(commitHash) {
    const commit = JSON.parse(this.readObject(commitHash));
    const tree = JSON.parse(this.readObject(commit.tree));

    for (const [filePath, entry] of Object.entries(tree)) {
      const fullPath = path.join(this.workdir, filePath);
      const content = this.readObject(entry.hash);
      
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }

  listBranches() {
    if (!fs.existsSync(this.refsDir)) return [];
    
    const current = this.getCurrentBranch();
    const branches = fs.readdirSync(this.refsDir).map(name => ({
      name,
      current: name === current,
      commit: fs.readFileSync(path.join(this.refsDir, name), 'utf-8').trim().slice(0, 8) || '(empty)',
    }));

    return branches;
  }

  // ============================================================================
  // History
  // ============================================================================

  log(limit = 10) {
    const commits = [];
    let hash = this.getHead();

    while (hash && commits.length < limit) {
      const commit = JSON.parse(this.readObject(hash));
      commits.push({
        hash: hash.slice(0, 8),
        message: commit.message,
        timestamp: commit.timestamp,
        author: commit.author,
      });
      hash = commit.parent;
    }

    return commits;
  }

  // ============================================================================
  // Diff
  // ============================================================================

  diff(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workdir, filePath);
    const relativePath = path.relative(this.workdir, fullPath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'File not found' };
    }

    const currentContent = fs.readFileSync(fullPath, 'utf-8');
    
    // Get content from HEAD
    const headCommit = this.getHeadCommit();
    if (!headCommit) {
      return { 
        success: true, 
        status: 'new file',
        lines: currentContent.split('\n').length,
      };
    }

    const tree = JSON.parse(this.readObject(headCommit.tree) || '{}');
    const entry = tree[relativePath];

    if (!entry) {
      return { 
        success: true, 
        status: 'new file',
        lines: currentContent.split('\n').length,
      };
    }

    const oldContent = this.readObject(entry.hash);
    
    if (oldContent === currentContent) {
      return { success: true, status: 'unchanged' };
    }

    // Simple line-based diff
    const oldLines = oldContent.split('\n');
    const newLines = currentContent.split('\n');
    
    const diff = this._computeDiff(oldLines, newLines);

    return {
      success: true,
      status: 'modified',
      diff,
      additions: diff.filter(d => d.type === '+').length,
      deletions: diff.filter(d => d.type === '-').length,
    };
  }

  _computeDiff(oldLines, newLines) {
    const diff = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    // Simple diff - not optimal but functional
    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        diff.push({ type: '+', line: j + 1, content: newLines[j] });
        j++;
      } else if (j >= newLines.length) {
        diff.push({ type: '-', line: i + 1, content: oldLines[i] });
        i++;
      } else if (oldLines[i] === newLines[j]) {
        diff.push({ type: ' ', line: j + 1, content: newLines[j] });
        i++;
        j++;
      } else {
        // Look ahead to find match
        let foundInNew = newLines.indexOf(oldLines[i], j);
        let foundInOld = oldLines.indexOf(newLines[j], i);

        if (foundInNew !== -1 && (foundInOld === -1 || foundInNew - j < foundInOld - i)) {
          // Lines were added
          while (j < foundInNew) {
            diff.push({ type: '+', line: j + 1, content: newLines[j] });
            j++;
          }
        } else if (foundInOld !== -1) {
          // Lines were deleted
          while (i < foundInOld) {
            diff.push({ type: '-', line: i + 1, content: oldLines[i] });
            i++;
          }
        } else {
          // Line changed
          diff.push({ type: '-', line: i + 1, content: oldLines[i] });
          diff.push({ type: '+', line: j + 1, content: newLines[j] });
          i++;
          j++;
        }
      }
    }

    return diff;
  }

  // ============================================================================
  // Rollback
  // ============================================================================

  rollback(commitHash) {
    // Find full hash if short hash provided
    let fullHash = commitHash;
    if (commitHash.length < 64) {
      const commits = this.log(100);
      const match = commits.find(c => c.hash.startsWith(commitHash));
      if (!match) {
        return { success: false, error: `Commit '${commitHash}' not found` };
      }
      // Need to find full hash by walking history
      let hash = this.getHead();
      while (hash) {
        if (hash.startsWith(commitHash)) {
          fullHash = hash;
          break;
        }
        const commit = JSON.parse(this.readObject(hash));
        hash = commit.parent;
      }
    }

    this._restoreTree(fullHash);
    
    return { 
      success: true, 
      message: `Rolled back to ${commitHash}`,
      note: 'Working directory restored. Use commit to save this state.',
    };
  }

  // ============================================================================
  // Stash
  // ============================================================================

  stash(message = 'WIP') {
    const status = this.status();
    if (status.clean && status.staged.length === 0) {
      return { success: false, error: 'Nothing to stash' };
    }

    // Stage all modified files
    for (const file of status.modified) {
      this.stage(file);
    }

    // Create stash commit
    const stashCommit = this.commit(`stash: ${message}`);
    if (!stashCommit.success) return stashCommit;

    // Restore to HEAD~1
    const headCommit = this.getHeadCommit();
    if (headCommit.parent) {
      this._restoreTree(headCommit.parent);
    }

    // Save stash reference
    const stashFile = path.join(this.avcsDir, 'stash');
    const stashes = fs.existsSync(stashFile) 
      ? JSON.parse(fs.readFileSync(stashFile, 'utf-8'))
      : [];
    
    stashes.push({
      hash: stashCommit.hash,
      message,
      timestamp: new Date().toISOString(),
    });
    
    fs.writeFileSync(stashFile, JSON.stringify(stashes, null, 2));

    return { success: true, message: `Stashed: ${message}`, hash: stashCommit.hash };
  }

  stashPop() {
    const stashFile = path.join(this.avcsDir, 'stash');
    if (!fs.existsSync(stashFile)) {
      return { success: false, error: 'No stashes found' };
    }

    const stashes = JSON.parse(fs.readFileSync(stashFile, 'utf-8'));
    if (stashes.length === 0) {
      return { success: false, error: 'No stashes found' };
    }

    const stash = stashes.pop();
    fs.writeFileSync(stashFile, JSON.stringify(stashes, null, 2));

    // Find full hash and restore
    let hash = this.getHead();
    while (hash) {
      if (hash.startsWith(stash.hash)) {
        this._restoreTree(hash);
        return { success: true, message: `Applied stash: ${stash.message}` };
      }
      const commit = JSON.parse(this.readObject(hash));
      hash = commit.parent;
    }

    return { success: false, error: 'Stash commit not found' };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

const VERSION_CONTROL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'vcs_init',
      description: 'Initialize Aria version control in the current workspace',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_status',
      description: 'Show the status of the working directory (staged, modified, untracked files)',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_stage',
      description: 'Stage a file for commit',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to stage' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_commit',
      description: 'Commit staged changes with a message',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_log',
      description: 'Show commit history',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of commits to show (default: 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_diff',
      description: 'Show diff for a file compared to last commit',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to diff' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_branch',
      description: 'Create a new branch or list branches',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Branch name to create (omit to list branches)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_checkout',
      description: 'Switch to a branch or commit',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Branch name or commit hash' },
        },
        required: ['target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_rollback',
      description: 'Restore working directory to a previous commit',
      parameters: {
        type: 'object',
        properties: {
          commit: { type: 'string', description: 'Commit hash to rollback to' },
        },
        required: ['commit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_stash',
      description: 'Stash current changes',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Stash message' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vcs_stash_pop',
      description: 'Apply and remove the most recent stash',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// ============================================================================
// Tool Executor
// ============================================================================

class VersionControlTools {
  constructor(workdir) {
    this.vcs = new AriaVersionControl(workdir);
  }

  async execute(toolName, args) {
    try {
      switch (toolName) {
        case 'vcs_init':
          return this.vcs.init();
        case 'vcs_status':
          return this.vcs.status();
        case 'vcs_stage':
          return this.vcs.stage(args.path);
        case 'vcs_commit':
          return this.vcs.commit(args.message);
        case 'vcs_log':
          return this.vcs.log(args.limit || 10);
        case 'vcs_diff':
          return this.vcs.diff(args.path);
        case 'vcs_branch':
          return args.name ? this.vcs.createBranch(args.name) : this.vcs.listBranches();
        case 'vcs_checkout':
          return this.vcs.checkout(args.target);
        case 'vcs_rollback':
          return this.vcs.rollback(args.commit);
        case 'vcs_stash':
          return this.vcs.stash(args.message);
        case 'vcs_stash_pop':
          return this.vcs.stashPop();
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getToolDefinitions() {
    return VERSION_CONTROL_TOOLS;
  }
}

module.exports = {
  AriaVersionControl,
  VersionControlTools,
  VERSION_CONTROL_TOOLS,
};
