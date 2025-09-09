/**
 * Backup System Module
 *
 * Creates timestamped backups of runs/ and dist/ directories with
 * optional S3 upload support for disaster recovery.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import yazl from 'yazl';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Patterns to exclude from backups
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.env',
  '*.key',
  '*.pem',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.tmp',
  '.vscode',
  '.idea',
];

/**
 * Check if path should be excluded
 */
function shouldExclude(filePath) {
  const basename = path.basename(filePath);

  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.startsWith('*')) {
      // Extension pattern
      const ext = pattern.slice(1);
      if (basename.endsWith(ext)) {
        return true;
      }
    } else {
      // Exact match
      if (basename === pattern || filePath.includes(`/${pattern}/`)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively collect files to backup
 */
async function collectFiles(dir, baseDir = dir) {
  const files = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (shouldExclude(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into directory
        const subFiles = await collectFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Add file with relative path
        const relativePath = path.relative(baseDir, fullPath);
        files.push({
          absolute: fullPath,
          relative: relativePath.replace(/\\/g, '/'), // Normalize for zip
          stats: await fs.stat(fullPath),
        });
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to read ${dir}: ${error.message}`);
    }
  }

  return files;
}

/**
 * Create backup archive
 */
async function createArchive(files, outputPath) {
  const archive = new yazl.ZipFile();

  // Add files to archive
  for (const file of files) {
    try {
      archive.addFile(file.absolute, file.relative);
    } catch (error) {
      console.warn(`Failed to add ${file.relative}: ${error.message}`);
    }
  }

  // End archive
  archive.end();

  // Write to file
  const output = createWriteStream(outputPath);
  await pipeline(archive.outputStream, output);

  // Get final size
  const stats = await fs.stat(outputPath);

  return {
    path: outputPath,
    size: stats.size,
    fileCount: files.length,
  };
}

/**
 * Create backup metadata
 */
function createMetadata(scope, files, tenants) {
  const totalSize = files.reduce((sum, f) => sum + f.stats.size, 0);

  return {
    version: '1.0',
    created_at: new Date().toISOString(),
    scope,
    tenants,
    statistics: {
      file_count: files.length,
      total_size: totalSize,
      total_size_mb: Math.round((totalSize / 1024 / 1024) * 100) / 100,
    },
    environment: {
      node_version: process.version,
      platform: process.platform,
      hostname: process.env.HOSTNAME || 'unknown',
    },
    files: files.slice(0, 100).map((f) => ({
      // First 100 files as sample
      path: f.relative,
      size: f.stats.size,
      modified: f.stats.mtime.toISOString(),
    })),
  };
}

/**
 * Upload to S3 (if configured)
 */
async function uploadToS3(localPath, s3Key) {
  const bucket = process.env.BACKUP_S3_BUCKET;

  if (!bucket) {
    return null;
  }

  try {
    // Check if AWS SDK is available
    // @ts-ignore - optional dependency
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const fileStream = await fs.readFile(localPath);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: fileStream,
      ContentType: 'application/zip',
      Metadata: {
        'backup-version': '1.0',
        'created-at': new Date().toISOString(),
      },
    });

    const response = await client.send(command);

    console.log(`✓ Uploaded to S3: s3://${bucket}/${s3Key}`);

    return {
      bucket,
      key: s3Key,
      etag: response.ETag,
      version_id: response.VersionId,
    };
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('AWS SDK not installed, skipping S3 upload');
      console.log('Install with: npm install @aws-sdk/client-s3');
    } else {
      console.error(`S3 upload failed: ${error.message}`);
    }
    return null;
  }
}

/**
 * Create backup of specified scope
 */
export async function createBackup(scope = 'both', options = {}) {
  const { tenant = null, uploadS3 = true, compress = true } = options;

  // Generate timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5); // Remove milliseconds and Z

  // Determine directories to backup
  const dirs = [];

  if (scope === 'runs' || scope === 'both') {
    dirs.push({ name: 'runs', path: path.join(projectRoot, 'runs') });
  }

  if (scope === 'dist' || scope === 'both') {
    dirs.push({ name: 'dist', path: path.join(projectRoot, 'dist') });
  }

  if (scope === 'reports') {
    dirs.push({ name: 'reports', path: path.join(projectRoot, 'reports') });
  }

  // Collect files
  console.log(`Collecting files for backup (scope: ${scope})...`);

  const allFiles = [];
  const tenants = new Set(['default']);

  for (const dir of dirs) {
    const files = await collectFiles(dir.path);

    // Extract tenant info from paths
    for (const file of files) {
      // Match tenants/xxx pattern in paths (cross-platform)
      const parts = file.relative.split(/[/\\]/);
      const tenantsIndex = parts.indexOf('tenants');
      if (tenantsIndex !== -1 && tenantsIndex < parts.length - 1) {
        tenants.add(parts[tenantsIndex + 1]);
      }

      // Add directory prefix
      file.relative = `${dir.name}/${file.relative}`;
    }

    allFiles.push(...files);
  }

  // Filter by tenant if specified
  let filesToBackup = allFiles;

  if (tenant) {
    filesToBackup = allFiles.filter((f) => {
      if (tenant === 'default') {
        // Default tenant includes non-tenant files
        return !f.relative.includes('/tenants/');
      } else {
        // Specific tenant only
        return f.relative.includes(`/tenants/${tenant}/`);
      }
    });
  }

  if (filesToBackup.length === 0) {
    console.log('No files to backup');
    return null;
  }

  console.log(`Found ${filesToBackup.length} files to backup`);

  // Create backup directory
  const backupDir = path.join(projectRoot, 'backups', timestamp);
  await fs.mkdir(backupDir, { recursive: true });

  // Create metadata
  const metadata = createMetadata(scope, filesToBackup, Array.from(tenants));
  const metadataPath = path.join(backupDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

  let archiveInfo = null;
  let s3Info = null;

  if (compress) {
    // Create archive
    const archiveName = tenant
      ? `backup-${scope}-${tenant}-${timestamp}.zip`
      : `backup-${scope}-${timestamp}.zip`;

    const archivePath = path.join(backupDir, archiveName);

    console.log(`Creating archive: ${archiveName}`);
    archiveInfo = await createArchive(filesToBackup, archivePath);

    console.log(
      `✓ Archive created: ${archiveInfo.fileCount} files, ${Math.round((archiveInfo.size / 1024 / 1024) * 100) / 100} MB`,
    );

    // Upload to S3 if configured
    if (uploadS3 && process.env.BACKUP_S3_BUCKET) {
      const s3Key = `backups/${timestamp}/${archiveName}`;
      s3Info = await uploadToS3(archivePath, s3Key);
    }
  } else {
    // Copy files without compression
    const backupDataDir = path.join(backupDir, 'data');

    for (const file of filesToBackup) {
      const destPath = path.join(backupDataDir, file.relative);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(file.absolute, destPath);
    }

    console.log(`✓ Files copied: ${filesToBackup.length} files`);
  }

  // Log backup event
  const event = {
    event: 'BackupCreated',
    timestamp: new Date().toISOString(),
    backup_id: timestamp,
    scope,
    tenant,
    statistics: metadata.statistics,
    archive: archiveInfo,
    s3: s3Info,
  };

  await appendToHooks(event);

  return {
    id: timestamp,
    path: backupDir,
    metadata,
    archive: archiveInfo,
    s3: s3Info,
  };
}

/**
 * List available backups
 */
export async function listBackups() {
  const backupsDir = path.join(projectRoot, 'backups');
  const backups = [];

  try {
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const backupPath = path.join(backupsDir, entry.name);
      const metadataPath = path.join(backupPath, 'metadata.json');

      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

        // Find archive files
        const files = await fs.readdir(backupPath);
        const archives = files.filter((f) => f.endsWith('.zip'));

        backups.push({
          id: entry.name,
          created_at: metadata.created_at,
          scope: metadata.scope,
          tenants: metadata.tenants,
          statistics: metadata.statistics,
          archives,
          path: backupPath,
        });
      } catch (error) {
        // Invalid backup directory
        console.warn(`Invalid backup ${entry.name}: ${error.message}`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Sort by creation time (newest first)
  backups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return backups;
}

/**
 * Clean old backups
 */
export async function cleanOldBackups(maxAgeDays = 30) {
  const backupsDir = path.join(projectRoot, 'backups');
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const removed = [];

  try {
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const backupPath = path.join(backupsDir, entry.name);
      const stats = await fs.stat(backupPath);

      if (stats.mtime.getTime() < cutoffTime) {
        await fs.rm(backupPath, { recursive: true, force: true });
        removed.push(entry.name);
        console.log(`Removed old backup: ${entry.name}`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return removed;
}

/**
 * Append event to observability hooks
 */
async function appendToHooks(event) {
  const hooksPath = path.join(projectRoot, 'runs', 'observability', 'hooks.jsonl');

  try {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.appendFile(hooksPath, JSON.stringify(event) + '\n');
  } catch (error) {
    console.error(`Failed to write to hooks: ${error.message}`);
  }
}

/**
 * CLI interface
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];

  const commands = {
    async create() {
      const scope = process.argv[3] || 'both';
      const tenant = process.argv[4];

      const backup = await createBackup(scope, { tenant });

      if (backup) {
        console.log('Backup created:', JSON.stringify(backup, null, 2));
      }
    },

    async list() {
      const backups = await listBackups();
      console.log(`Found ${backups.length} backups:`);

      for (const backup of backups) {
        console.log(`  ${backup.id}`);
        console.log(`    Created: ${backup.created_at}`);
        console.log(`    Scope: ${backup.scope}`);
        console.log(`    Size: ${backup.statistics.total_size_mb} MB`);
        console.log(`    Files: ${backup.statistics.file_count}`);
      }
    },

    async clean() {
      const days = parseInt(process.argv[3]) || 30;
      const removed = await cleanOldBackups(days);
      console.log(`Removed ${removed.length} old backups`);
    },
  };

  if (!command || !commands[command]) {
    console.log('Available commands:');
    console.log('  create [scope] [tenant] - Create backup (scope: runs|dist|both|reports)');
    console.log('  list                    - List available backups');
    console.log('  clean [days]           - Remove backups older than N days');
    process.exit(0);
  }

  commands[command]()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}

// Export for testing
export { shouldExclude };
