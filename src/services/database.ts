/**
 * PostgreSQL Database Service
 *
 * Handles database connections and wallet storage for the Obsidian Wallet UI.
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection pool
let pool: pg.Pool | null = null;

/**
 * Initialize the database connection pool
 */
export async function initDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('[DB] DATABASE_URL not set - database features disabled');
    return;
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  // Test connection
  try {
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL');
    client.release();

    // Run migrations
    await runMigrations();
  } catch (error) {
    console.error('[DB] Connection failed:', error);
    pool = null;
  }
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
  if (!pool) return;

  const migrations = `
    -- Master wallets (one per user session)
    CREATE TABLE IF NOT EXISTS master_wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id VARCHAR(255) UNIQUE NOT NULL,
      public_key VARCHAR(64) NOT NULL,
      api_key_id VARCHAR(255),
      label VARCHAR(100) DEFAULT 'Master Wallet',
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Sub-wallets linked to master
    CREATE TABLE IF NOT EXISTS sub_wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_wallet_id UUID REFERENCES master_wallets(id) ON DELETE CASCADE,
      external_id VARCHAR(255) UNIQUE NOT NULL,
      public_key VARCHAR(64) NOT NULL,
      api_key_id VARCHAR(255),
      label VARCHAR(100) NOT NULL,
      color VARCHAR(7) DEFAULT '#8b5cf6',
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Browser sessions
    CREATE TABLE IF NOT EXISTS wallet_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_token VARCHAR(255) UNIQUE NOT NULL,
      master_wallet_id UUID REFERENCES master_wallets(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_sub_wallets_master ON sub_wallets(master_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON wallet_sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON wallet_sessions(expires_at);
  `;

  try {
    await pool.query(migrations);
    console.log('[DB] Migrations completed');
  } catch (error) {
    console.error('[DB] Migration failed:', error);
  }
}

/**
 * Get database pool (returns null if not initialized)
 */
export function getPool(): pg.Pool | null {
  return pool;
}

/**
 * Check if database is available
 */
export function isDatabaseAvailable(): boolean {
  return pool !== null;
}

// ============================================
// Wallet Storage Functions
// ============================================

export interface MasterWallet {
  id: string;
  external_id: string;
  public_key: string;
  api_key_id: string | null;
  label: string;
  created_at: Date;
}

export interface SubWallet {
  id: string;
  master_wallet_id: string;
  external_id: string;
  public_key: string;
  api_key_id: string | null;
  label: string;
  color: string;
  created_at: Date;
}

export interface WalletSession {
  id: string;
  session_token: string;
  master_wallet_id: string;
  expires_at: Date;
  created_at: Date;
}

/**
 * Create a new master wallet
 */
export async function createMasterWallet(
  externalId: string,
  publicKey: string,
  apiKeyId?: string,
  label: string = 'Master Wallet'
): Promise<MasterWallet | null> {
  if (!pool) return null;

  try {
    const result = await pool.query(
      `INSERT INTO master_wallets (external_id, public_key, api_key_id, label)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [externalId, publicKey, apiKeyId || null, label]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error creating master wallet:', error);
    return null;
  }
}

/**
 * Create a new sub-wallet
 */
export async function createSubWallet(
  masterWalletId: string,
  externalId: string,
  publicKey: string,
  label: string,
  apiKeyId?: string,
  color: string = '#8b5cf6'
): Promise<SubWallet | null> {
  if (!pool) return null;

  try {
    const result = await pool.query(
      `INSERT INTO sub_wallets (master_wallet_id, external_id, public_key, api_key_id, label, color)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [masterWalletId, externalId, publicKey, apiKeyId || null, label, color]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error creating sub wallet:', error);
    return null;
  }
}

/**
 * Get master wallet by ID
 */
export async function getMasterWalletById(id: string): Promise<MasterWallet | null> {
  if (!pool) return null;

  try {
    const result = await pool.query(
      'SELECT * FROM master_wallets WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Error getting master wallet:', error);
    return null;
  }
}

/**
 * Get master wallet by external ID
 */
export async function getMasterWalletByExternalId(externalId: string): Promise<MasterWallet | null> {
  if (!pool) return null;

  try {
    const result = await pool.query(
      'SELECT * FROM master_wallets WHERE external_id = $1',
      [externalId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Error getting master wallet:', error);
    return null;
  }
}

/**
 * Get all sub-wallets for a master wallet
 */
export async function getSubWallets(masterWalletId: string): Promise<SubWallet[]> {
  if (!pool) return [];

  try {
    const result = await pool.query(
      'SELECT * FROM sub_wallets WHERE master_wallet_id = $1 ORDER BY created_at ASC',
      [masterWalletId]
    );
    return result.rows;
  } catch (error) {
    console.error('[DB] Error getting sub wallets:', error);
    return [];
  }
}

/**
 * Get sub-wallet by ID
 */
export async function getSubWalletById(id: string): Promise<SubWallet | null> {
  if (!pool) return null;

  try {
    const result = await pool.query(
      'SELECT * FROM sub_wallets WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Error getting sub wallet:', error);
    return null;
  }
}

/**
 * Delete a sub-wallet
 */
export async function deleteSubWallet(id: string): Promise<boolean> {
  if (!pool) return false;

  try {
    const result = await pool.query(
      'DELETE FROM sub_wallets WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('[DB] Error deleting sub wallet:', error);
    return false;
  }
}

/**
 * Create a new session
 */
export async function createSession(
  masterWalletId: string,
  sessionToken: string,
  expiresInHours: number = 24 * 7 // 1 week default
): Promise<WalletSession | null> {
  if (!pool) return null;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  try {
    const result = await pool.query(
      `INSERT INTO wallet_sessions (session_token, master_wallet_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [sessionToken, masterWalletId, expiresAt]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error creating session:', error);
    return null;
  }
}

/**
 * Get session by token
 */
export async function getSessionByToken(sessionToken: string): Promise<WalletSession | null> {
  if (!pool) return null;

  try {
    const result = await pool.query(
      'SELECT * FROM wallet_sessions WHERE session_token = $1 AND expires_at > NOW()',
      [sessionToken]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Error getting session:', error);
    return null;
  }
}

/**
 * Delete expired sessions (cleanup)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  if (!pool) return 0;

  try {
    const result = await pool.query(
      'DELETE FROM wallet_sessions WHERE expires_at < NOW()'
    );
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('[DB] Error cleaning up sessions:', error);
    return 0;
  }
}

/**
 * Get wallet by public key (searches both master and sub wallets)
 */
export async function getWalletByPublicKey(publicKey: string): Promise<{
  type: 'master' | 'sub';
  wallet: MasterWallet | SubWallet;
} | null> {
  if (!pool) return null;

  try {
    // Check master wallets first
    const masterResult = await pool.query(
      'SELECT * FROM master_wallets WHERE public_key = $1',
      [publicKey]
    );
    if (masterResult.rows[0]) {
      return { type: 'master', wallet: masterResult.rows[0] };
    }

    // Check sub wallets
    const subResult = await pool.query(
      'SELECT * FROM sub_wallets WHERE public_key = $1',
      [publicKey]
    );
    if (subResult.rows[0]) {
      return { type: 'sub', wallet: subResult.rows[0] };
    }

    return null;
  } catch (error) {
    console.error('[DB] Error getting wallet by public key:', error);
    return null;
  }
}
