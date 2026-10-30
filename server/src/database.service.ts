import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import mysql, { Pool, RowDataPacket } from 'mysql2/promise';

export type ChatRecord = {
  sessionId: string;
  message: string;
  answer: string;
  model?: string;
  baseUrl?: string;
  apiKeyMasked?: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
};

type SessionRow = RowDataPacket & {
  session_id: string;
  model: string | null;
  base_url: string | null;
  api_key_masked: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  message_count: number;
};

export type UserRecord = { id: number; email: string };
export type StoredModelConfig = {
  baseUrl: string;
  textModel: string;
  imageModel: string | null;
  videoModel: string | null;
  apiKeyCiphertext: string;
  apiKeyIv: string;
  apiKeyTag: string;
  updatedAt: Date;
};
export type ChatMessageRecord = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  mode: string | null;
  created_at: Date;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;

  get enabled() {
    return this.pool !== null;
  }

  async onModuleInit() {
    if (!process.env.MYSQL_HOST) return;
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 10),
      waitForConnections: true,
      charset: 'utf8mb4',
      multipleStatements: true,
    });
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL UNIQUE,
        model VARCHAR(255) NULL,
        base_url VARCHAR(512) NULL,
        api_key_masked VARCHAR(32) NULL,
        first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_sessions_last_seen (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content LONGTEXT NOT NULL,
        model VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_messages_session (session_id),
        INDEX idx_messages_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS chat_requests (
        id CHAR(36) NOT NULL PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL,
        status ENUM('processing', 'success', 'error') NOT NULL,
        duration_ms INT UNSIGNED NULL,
        error_message TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_requests_session (session_id),
        INDEX idx_requests_created (created_at),
        INDEX idx_requests_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS admin_accounts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        last_login_at DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        admin_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_admin_sessions_expiry (expires_at),
        CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_accounts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_user_sessions_expiry (expires_at),
        CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_model_configs (
        user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        base_url VARCHAR(512) NOT NULL,
        model VARCHAR(255) NOT NULL,
        image_model VARCHAR(255) NULL,
        video_model VARCHAR(255) NULL,
        api_key_ciphertext LONGTEXT NOT NULL,
        api_key_iv CHAR(24) NOT NULL,
        api_key_tag CHAR(32) NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_model_config_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_chat_sessions (
        chat_id CHAR(36) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT '新对话',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_user_chats_recent (user_id, updated_at),
        CONSTRAINT fk_user_chats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_chat_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        chat_id CHAR(36) NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content LONGTEXT NOT NULL,
        model VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_user_chat_messages (chat_id, created_at, id),
        CONSTRAINT fk_user_chat_messages_chat FOREIGN KEY (chat_id) REFERENCES user_chat_sessions(chat_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS image_generations (
        image_id CHAR(36) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        prompt TEXT NOT NULL,
        size VARCHAR(32) NOT NULL,
        model VARCHAR(255) NOT NULL,
        result_url LONGTEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_user_images_recent (user_id, created_at),
        CONSTRAINT fk_images_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_generation_requests (
        id CHAR(36) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        content_type ENUM('chat', 'image', 'rewrite') NOT NULL,
        status ENUM('success', 'error') NOT NULL,
        duration_ms INT UNSIGNED NOT NULL,
        error_message TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_generation_requests_date (created_at, status),
        CONSTRAINT fk_generation_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_rewrite_generations (
        rewrite_id CHAR(36) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        author VARCHAR(160) NOT NULL,
        topic VARCHAR(500) NOT NULL,
        constraints_text VARCHAR(1500) NOT NULL DEFAULT '',
        article LONGTEXT NOT NULL,
        model VARCHAR(255) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_user_rewrites_recent (user_id, created_at),
        CONSTRAINT fk_rewrites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS system_announcements (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'success', 'warning', 'urgent') NOT NULL DEFAULT 'info',
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        is_dismissible BOOLEAN NOT NULL DEFAULT TRUE,
        starts_at DATETIME(3) NULL,
        ends_at DATETIME(3) NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_announcements_schedule (is_published, starts_at, ends_at),
        CONSTRAINT fk_announcements_admin FOREIGN KEY (created_by) REFERENCES admin_accounts(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE IF NOT EXISTS user_announcement_dismissals (
        user_id BIGINT UNSIGNED NOT NULL,
        announcement_id BIGINT UNSIGNED NOT NULL,
        dismissed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, announcement_id),
        CONSTRAINT fk_announcement_dismissals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_announcement_dismissals_announcement FOREIGN KEY (announcement_id) REFERENCES system_announcements(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    const [userColumns] = await this.pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'`,
    );
    if (userColumns.length === 0) {
      await this.pool.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE');
    }
    const [deletedColumns] = await this.pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_deleted'`,
    );
    if (deletedColumns.length === 0) {
      await this.pool.query('ALTER TABLE users ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE');
    }
    const [videoModelColumns] = await this.pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_model_configs' AND COLUMN_NAME = 'video_model'`,
    );
    if (videoModelColumns.length === 0) {
      await this.pool.query('ALTER TABLE user_model_configs ADD COLUMN video_model VARCHAR(255) NULL AFTER image_model');
    }
    const [generationColumns] = await this.pool.query<RowDataPacket[]>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_generation_requests' AND COLUMN_NAME = 'content_type'`,
    );
    if (generationColumns[0] && !String(generationColumns[0].COLUMN_TYPE).includes('rewrite')) {
      await this.pool.query("ALTER TABLE user_generation_requests MODIFY content_type ENUM('chat', 'image', 'rewrite') NOT NULL");
    }
    // 会话模式与技能标识（统一会话协议）— 无条件执行
    try { await this.pool.query("ALTER TABLE user_chat_sessions ADD COLUMN mode VARCHAR(20) NULL AFTER title"); } catch {}
    try { await this.pool.query("ALTER TABLE user_chat_sessions ADD COLUMN skill_id VARCHAR(100) NULL AFTER mode"); } catch {}
    try { await this.pool.query("ALTER TABLE user_chat_messages ADD COLUMN mode VARCHAR(20) NULL AFTER model"); } catch {}
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async startRequest(requestId: string, record: Omit<ChatRecord, 'answer' | 'durationMs' | 'status' | 'errorMessage'>) {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO chat_sessions (session_id, model, base_url, api_key_masked)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE model = VALUES(model), base_url = VALUES(base_url), api_key_masked = VALUES(api_key_masked), last_seen_at = CURRENT_TIMESTAMP(3)`,
        [record.sessionId, record.model ?? null, record.baseUrl ?? null, record.apiKeyMasked ?? null],
      );
      await this.pool.query(
        'INSERT INTO chat_requests (id, session_id, status) VALUES (?, ?, ?)',
        [requestId, record.sessionId, 'processing'],
      );
    } catch (error) {
      console.error('Database start request failed:', error instanceof Error ? error.message : error);
    }
  }

  async finishRequest(requestId: string, record: ChatRecord) {
    if (!this.pool) return;
    try {
      await this.pool.query(
        'INSERT INTO chat_messages (session_id, role, content, model) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
        [record.sessionId, 'user', record.message, record.model ?? null, record.sessionId, 'assistant', record.answer, record.model ?? null],
      );
      await this.pool.query(
        'UPDATE chat_requests SET status = ?, duration_ms = ?, error_message = ? WHERE id = ?',
        [record.status, record.durationMs, record.errorMessage ?? null, requestId],
      );
    } catch (error) {
      console.error('Database finish request failed:', error instanceof Error ? error.message : error);
    }
  }

  async listSessions(search = '', limit = 50, offset = 0) {
    if (!this.pool) return { items: [], total: 0 };
    const term = `%${search}%`;
    const [items] = await this.pool.query<SessionRow[]>(
      `SELECT s.session_id, s.model, s.base_url, s.api_key_masked, s.first_seen_at, s.last_seen_at,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.session_id) AS message_count
       FROM chat_sessions s
       WHERE s.session_id LIKE ? OR s.model LIKE ? OR s.base_url LIKE ?
       ORDER BY s.last_seen_at DESC LIMIT ? OFFSET ?`,
      [term, term, term, limit, offset],
    );
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM chat_sessions WHERE session_id LIKE ? OR model LIKE ? OR base_url LIKE ?',
      [term, term, term],
    );
    return { items, total: Number(countRows[0]?.total ?? 0) };
  }

  async getSession(sessionId: string) {
    if (!this.pool) return null;
    const [sessions] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM chat_sessions WHERE session_id = ?',
      [sessionId],
    );
    if (!sessions[0]) return null;
    const [messages] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, role, content, model, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC',
      [sessionId],
    );
    const [requests] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, status, duration_ms, error_message, created_at FROM chat_requests WHERE session_id = ? ORDER BY created_at DESC',
      [sessionId],
    );
    return { session: sessions[0], messages, requests };
  }

  async getOverview() {
    if (!this.pool) return { enabled: false, sessions: 0, messages: 0, requests: 0, errors: 0, averageDurationMs: 0 };
    const [rows] = await this.pool.query<RowDataPacket[]>(`SELECT
      (SELECT COUNT(*) FROM chat_sessions) AS sessions,
      (SELECT COUNT(*) FROM chat_messages) AS messages,
      (SELECT COUNT(*) FROM chat_requests) AS requests,
      (SELECT COUNT(*) FROM chat_requests WHERE status = 'error') AS errors,
      COALESCE((SELECT AVG(duration_ms) FROM chat_requests WHERE status = 'success'), 0) AS averageDurationMs`);
    return { enabled: true, ...rows[0] };
  }

  private requirePool() {
    if (!this.pool) throw new ServiceUnavailableException('数据库未配置');
    return this.pool;
  }

  async createUser(email: string, passwordHash: string): Promise<UserRecord> {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash],
    );
    return { id: result.insertId, email };
  }

  async findUserByEmail(email: string) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, password_hash, is_active, is_deleted FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    return rows[0] as (UserRecord & { password_hash: string; is_active: number | boolean; is_deleted: number | boolean }) | undefined;
  }

  async createAuthSession(userId: number, tokenHash: string, expiresAt: Date) {
    const pool = this.requirePool();
    await pool.query(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt],
    );
  }

  async findUserBySession(tokenHash: string): Promise<UserRecord | null> {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.email FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
      AND u.is_active = TRUE AND u.is_deleted = FALSE LIMIT 1`,
      [tokenHash],
    );
    if (!rows[0]) return null;
    await pool.query('UPDATE user_sessions SET last_used_at = CURRENT_TIMESTAMP(3) WHERE token_hash = ?', [tokenHash]);
    return { id: Number(rows[0].id), email: String(rows[0].email) };
  }

  async deleteAuthSession(tokenHash: string) {
    const pool = this.requirePool();
    await pool.query('DELETE FROM user_sessions WHERE token_hash = ?', [tokenHash]);
  }

  async getStoredModelConfig(userId: number): Promise<StoredModelConfig | null> {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT base_url AS baseUrl, model AS textModel, image_model AS imageModel,
       video_model AS videoModel,
       api_key_ciphertext AS apiKeyCiphertext, api_key_iv AS apiKeyIv,
       api_key_tag AS apiKeyTag, updated_at AS updatedAt
       FROM user_model_configs WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    return (rows[0] as StoredModelConfig | undefined) ?? null;
  }

  async saveStoredModelConfig(userId: number, config: Omit<StoredModelConfig, 'updatedAt'>) {
    const pool = this.requirePool();
    await pool.query(
      `INSERT INTO user_model_configs
      (user_id, base_url, model, image_model, video_model, api_key_ciphertext, api_key_iv, api_key_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE base_url = VALUES(base_url), model = VALUES(model),
      image_model = VALUES(image_model), video_model = VALUES(video_model), api_key_ciphertext = VALUES(api_key_ciphertext),
       api_key_iv = VALUES(api_key_iv), api_key_tag = VALUES(api_key_tag)`,
          [userId, config.baseUrl, config.textModel, config.imageModel, config.videoModel, config.apiKeyCiphertext, config.apiKeyIv, config.apiKeyTag],
    );
  }

  async createUserChat(userId: number, chatId: string) {
    const pool = this.requirePool();
    await pool.query('INSERT INTO user_chat_sessions (chat_id, user_id) VALUES (?, ?)', [chatId, userId]);
    return { chatId, title: '新对话' };
  }

  async deleteUserChat(userId: number, chatId: string) {
    const pool = this.requirePool();
    const [owned] = await pool.query<RowDataPacket[]>(
      'SELECT chat_id FROM user_chat_sessions WHERE chat_id = ? AND user_id = ?',
      [chatId, userId],
    );
    if (!owned[0]) throw new Error('会话不存在');
    await pool.query('DELETE FROM user_chat_sessions WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
  }

  async listUserChats(userId: number) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT chat_id AS chatId, title, created_at AS createdAt, updated_at AS updatedAt
       FROM user_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC`,
      [userId],
    );
    return rows;
  }

  async getUserChat(userId: number, chatId: string) {
    const pool = this.requirePool();
    const [chats] = await pool.query<RowDataPacket[]>(
      `SELECT chat_id AS chatId, title, mode, skill_id AS skillId, created_at AS createdAt, updated_at AS updatedAt
       FROM user_chat_sessions WHERE user_id = ? AND chat_id = ? LIMIT 1`,
      [userId, chatId],
    );
    if (!chats[0]) return null;
    const [messages] = await pool.query<RowDataPacket[]>(
      `SELECT id, role, content, model, mode, created_at AS createdAt
       FROM user_chat_messages WHERE chat_id = ? ORDER BY id ASC`,
      [chatId],
    );
    return { chat: chats[0], messages };
  }

  async appendUserChatExchange(
    userId: number,
    chatId: string,
    prompt: string,
    answer: string,
    model: string,
    mode: string | null = null,
    skillId: string | null = null,
  ) {
    const pool = this.requirePool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owned] = await connection.query<RowDataPacket[]>(
        'SELECT chat_id FROM user_chat_sessions WHERE chat_id = ? AND user_id = ? FOR UPDATE',
        [chatId, userId],
      );
      if (!owned[0]) throw new Error('会话不存在');
      await connection.query(
        'INSERT INTO user_chat_messages (chat_id, role, content, model, mode) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
        [chatId, 'user', prompt, model, mode, chatId, 'assistant', answer, model, mode],
      );
      await connection.query(
        `UPDATE user_chat_sessions
         SET title        = IF(title = '新对话', ?, title),
             mode         = COALESCE(mode, ?),
             skill_id     = COALESCE(skill_id, ?),
             updated_at   = CURRENT_TIMESTAMP(3)
         WHERE chat_id = ? AND user_id = ?`,
        [prompt.slice(0, 240), mode, skillId, chatId, userId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async saveUserImage(userId: number, image: { id: string; prompt: string; size: string; model: string; url: string }) {
    const pool = this.requirePool();
    await pool.query(
      `INSERT INTO image_generations (image_id, user_id, prompt, size, model, result_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [image.id, userId, image.prompt, image.size, image.model, image.url],
    );
  }

  async listUserImages(userId: number) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT image_id AS id, prompt, size, model, result_url AS url, created_at AS createdAt
       FROM image_generations WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async saveUserRewrite(userId: number, rewrite: {
    id: string; author: string; topic: string; constraints: string; article: string; model: string;
  }) {
    const pool = this.requirePool();
    await pool.query(
      `INSERT INTO user_rewrite_generations
       (rewrite_id, user_id, author, topic, constraints_text, article, model)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rewrite.id, userId, rewrite.author, rewrite.topic, rewrite.constraints, rewrite.article, rewrite.model],
    );
  }

  async listUserRewrites(userId: number) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT rewrite_id AS id, author, topic, created_at AS createdAt
       FROM user_rewrite_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
      [userId],
    );
    return rows;
  }

  async getUserRewrite(userId: number, rewriteId: string) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT rewrite_id AS id, author, topic, constraints_text AS constraints,
       article, model, created_at AS createdAt
       FROM user_rewrite_generations WHERE user_id = ? AND rewrite_id = ? LIMIT 1`,
      [userId, rewriteId],
    );
    return rows[0] ?? null;
  }

  async getAdminOverview() {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE) AS activeUsers,
      (SELECT COUNT(*) FROM user_chat_sessions) AS chats,
      (SELECT COUNT(*) FROM user_chat_messages) AS messages,
      (SELECT COUNT(*) FROM image_generations) AS images,
      ((SELECT COUNT(*) FROM chat_requests WHERE status = 'error') + (SELECT COUNT(*) FROM user_generation_requests WHERE status = 'error')) AS errors,
      COALESCE((SELECT SUM(duration_ms) FROM chat_requests WHERE status = 'success') + (SELECT SUM(duration_ms) FROM user_generation_requests WHERE status = 'success'), 0) /
      NULLIF((SELECT COUNT(*) FROM chat_requests WHERE status = 'success') + (SELECT COUNT(*) FROM user_generation_requests WHERE status = 'success'), 0) AS averageDurationMs`);
    const [activity] = await pool.query<RowDataPacket[]>(`SELECT activity_date AS date, SUM(chats) AS chats, SUM(images) AS images FROM (
      SELECT DATE_FORMAT(updated_at, '%Y-%m-%d') AS activity_date, COUNT(*) AS chats, 0 AS images
      FROM user_chat_sessions WHERE updated_at >= CURRENT_DATE - INTERVAL 6 DAY GROUP BY DATE_FORMAT(updated_at, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS activity_date, 0 AS chats, COUNT(*) AS images
      FROM image_generations WHERE created_at >= CURRENT_DATE - INTERVAL 6 DAY GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
    ) daily GROUP BY activity_date ORDER BY activity_date`);
    return { enabled: true, ...rows[0], activity };
  }

  async recordUserGenerationRequest(
    id: string,
    userId: number,
    contentType: 'chat' | 'image' | 'rewrite',
    durationMs: number,
    status: 'success' | 'error',
    errorMessage?: string,
  ) {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO user_generation_requests (id, user_id, content_type, status, duration_ms, error_message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, contentType, status, durationMs, errorMessage ?? null],
      );
    } catch (error) {
      console.error('Database generation analytics failed:', error instanceof Error ? error.message : error);
    }
  }

  async seedAdminAccount(email: string, passwordHash: string) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM admin_accounts');
    if (Number(rows[0]?.total) === 0) {
      await pool.query('INSERT INTO admin_accounts (email, password_hash) VALUES (?, ?)', [email, passwordHash]);
    }
  }

  async hasAdminAccounts() {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM admin_accounts');
    return Number(rows[0]?.total) > 0;
  }

  async findAdminByEmail(email: string) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, password_hash FROM admin_accounts WHERE email = ? LIMIT 1',
      [email],
    );
    return rows[0] as (UserRecord & { password_hash: string }) | undefined;
  }

  async createAdminSession(adminId: number, tokenHash: string, expiresAt: Date) {
    const pool = this.requirePool();
    await pool.query('INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, ?, ?)', [adminId, tokenHash, expiresAt]);
  }

  async findAdminBySession(tokenHash: string) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.email FROM admin_sessions s
       JOIN admin_accounts a ON a.id = s.admin_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3) LIMIT 1`,
      [tokenHash],
    );
    return rows[0] ? { id: Number(rows[0].id), email: String(rows[0].email) } : null;
  }

  async deleteAdminSession(tokenHash: string) {
    const pool = this.requirePool();
    await pool.query('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
  }

  async updateAdminLastLogin(adminId: number) {
    const pool = this.requirePool();
    await pool.query('UPDATE admin_accounts SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [adminId]);
  }

  async listAdminAccounts() {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT a.id, a.email, a.created_at AS createdAt,
      a.last_login_at AS lastLoginAt, (SELECT COUNT(*) FROM admin_accounts) AS adminCount
      FROM admin_accounts a ORDER BY a.id ASC`);
    return rows;
  }

  async createAdminAccount(email: string, passwordHash: string) {
    const pool = this.requirePool();
    await pool.query('INSERT INTO admin_accounts (email, password_hash) VALUES (?, ?)', [email, passwordHash]);
  }

  async changeAdminPassword(adminId: number, passwordHash: string) {
    const pool = this.requirePool();
    await pool.query('UPDATE admin_accounts SET password_hash = ? WHERE id = ?', [passwordHash, adminId]);
    await pool.query('DELETE FROM admin_sessions WHERE admin_id = ?', [adminId]);
  }

  async deleteAdminAccount(adminId: number, currentAdminId: number) {
    const pool = this.requirePool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>('SELECT id FROM admin_accounts FOR UPDATE');
      if (rows.length <= 1) throw new Error('至少保留一个管理员账户');
      if (adminId === currentAdminId) throw new Error('不能删除当前登录的管理员');
      await connection.query('DELETE FROM admin_accounts WHERE id = ?', [adminId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listAdminUsers(search: string, limit: number, offset: number) {
    const pool = this.requirePool();
    const term = `%${search}%`;
    const [items] = await pool.query<RowDataPacket[]>(`SELECT u.id, u.email, u.is_active AS isActive,
      u.created_at AS createdAt,
      (SELECT COUNT(*) FROM user_chat_sessions c WHERE c.user_id = u.id) AS chatCount,
      (SELECT COUNT(*) FROM image_generations i WHERE i.user_id = u.id) AS imageCount
      FROM users u WHERE u.is_deleted = FALSE AND u.email LIKE ? ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [term, limit, offset]);
    const [counts] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM users WHERE is_deleted = FALSE AND email LIKE ?', [term]);
    return { items, total: Number(counts[0]?.total ?? 0) };
  }

  async setUserActive(userId: number, isActive: boolean) {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET is_active = ? WHERE id = ? AND is_deleted = FALSE',
      [isActive, userId],
    );
    if (!isActive) await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
    return result.affectedRows > 0;
  }

  async deleteAdminUser(userId: number) {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET is_deleted = TRUE, is_active = FALSE WHERE id = ? AND is_deleted = FALSE',
      [userId],
    );
    await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
    return result.affectedRows > 0;
  }

  async changeUserPassword(userId: number, passwordHash: string) {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET password_hash = ? WHERE id = ? AND is_deleted = FALSE',
      [passwordHash, userId],
    );
    await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
    return result.affectedRows > 0;
  }

  async listAdminChats(search: string, limit: number, offset: number) {
    const pool = this.requirePool();
    const term = `%${search}%`;
    const union = `SELECT c.chat_id AS sessionId, u.email AS owner, c.title AS label,
        c.updated_at AS lastActivity, COUNT(m.id) AS messageCount, 'chat' AS kind
      FROM user_chat_sessions c JOIN users u ON u.id = c.user_id
      LEFT JOIN user_chat_messages m ON m.chat_id = c.chat_id
      GROUP BY c.chat_id, u.email, c.title, c.updated_at
      UNION ALL
      SELECT s.session_id AS sessionId, NULL AS owner, s.session_id AS label,
        s.last_seen_at AS lastActivity, COUNT(m.id) AS messageCount, 'legacy' AS kind
      FROM chat_sessions s LEFT JOIN chat_messages m ON m.session_id = s.session_id
      GROUP BY s.session_id, s.last_seen_at`;
    const [items] = await pool.query<RowDataPacket[]>(`SELECT * FROM (${union}) all_sessions
      WHERE sessionId LIKE ? OR owner LIKE ? OR label LIKE ?
      ORDER BY lastActivity DESC LIMIT ? OFFSET ?`, [term, term, term, limit, offset]);
    const [counts] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM (${union}) all_sessions
      WHERE sessionId LIKE ? OR owner LIKE ? OR label LIKE ?`, [term, term, term]);
    return { items, total: Number(counts[0]?.total ?? 0) };
  }

  /** Lists saved generation outputs by feature so administrators can inspect each tool independently. */
  async listAdminGenerations(kind: 'image' | 'rewrite', search: string, limit: number, offset: number) {
    const pool = this.requirePool();
    const term = `%${search}%`;
    const query = kind === 'image'
      ? `SELECT i.image_id AS id, u.email AS owner, i.prompt AS title,
          CONCAT(i.size, ' · ', i.model) AS summary, i.model, i.created_at AS createdAt
        FROM image_generations i JOIN users u ON u.id = i.user_id
        WHERE i.prompt LIKE ? OR u.email LIKE ? OR i.model LIKE ?`
      : `SELECT r.rewrite_id AS id, u.email AS owner, r.topic AS title,
          CONCAT('作者：', r.author, IF(r.constraints_text = '', '', CONCAT(' · 限定：', r.constraints_text))) AS summary,
          r.model, r.created_at AS createdAt
        FROM user_rewrite_generations r JOIN users u ON u.id = r.user_id
        WHERE r.topic LIKE ? OR r.author LIKE ? OR r.constraints_text LIKE ? OR u.email LIKE ?`;
    const params = kind === 'image'
      ? [term, term, term]
      : [term, term, term, term];
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM (${query}) generation_records ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM (${query}) generation_records`,
      params,
    );
    return { items, total: Number(counts[0]?.total ?? 0) };
  }

  /** Fetches the potentially large generated payload only after an admin opens one record. */
  async getAdminGeneration(kind: 'image' | 'rewrite', id: string) {
    const pool = this.requirePool();
    const table = kind === 'image' ? 'image_generations' : 'user_rewrite_generations';
    const idColumn = kind === 'image' ? 'image_id' : 'rewrite_id';
    const payloadColumn = kind === 'image' ? 'result_url AS resultUrl' : 'article AS content';
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${payloadColumn} FROM ${table} WHERE ${idColumn} = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async getAdminChat(sessionId: string, kind: string) {
    const pool = this.requirePool();
    if (kind === 'legacy') {
      const legacy = await this.getSession(sessionId);
      if (!legacy) return null;
      return {
        session: {
          sessionId: legacy.session.session_id,
          title: legacy.session.session_id,
          owner: null,
          model: legacy.session.model,
          base_url: legacy.session.base_url,
          api_key_masked: legacy.session.api_key_masked,
        },
        messages: legacy.messages.map((message) => ({ ...message, createdAt: message.created_at })),
      };
    }
    const [chats] = await pool.query<RowDataPacket[]>(`SELECT c.chat_id AS sessionId, c.title, c.updated_at AS lastActivity,
      u.email AS owner, c.user_id AS userId
      FROM user_chat_sessions c JOIN users u ON u.id = c.user_id WHERE c.chat_id = ? LIMIT 1`, [sessionId]);
    if (!chats[0]) return null;
    const [messages] = await pool.query<RowDataPacket[]>(`SELECT id, role, content, model, created_at AS createdAt
      FROM user_chat_messages WHERE chat_id = ? ORDER BY id ASC`, [sessionId]);
    return { session: chats[0], messages };
  }

  async deleteAdminChat(sessionId: string, kind: string) {
    const pool = this.requirePool();
    if (kind === 'legacy') {
      await pool.query('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
      await pool.query('DELETE FROM chat_requests WHERE session_id = ?', [sessionId]);
      await pool.query('DELETE FROM chat_sessions WHERE session_id = ?', [sessionId]);
      return;
    }
    await pool.query('DELETE FROM user_chat_sessions WHERE chat_id = ?', [sessionId]);
  }

  async listAdminAnnouncements() {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT a.id, a.title, a.message, a.type,
      a.is_published AS isPublished, a.is_dismissible AS isDismissible,
      a.starts_at AS startsAt, a.ends_at AS endsAt,
      a.created_at AS createdAt, a.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM user_announcement_dismissals d WHERE d.announcement_id = a.id) AS dismissCount
      FROM system_announcements a ORDER BY a.created_at DESC`);
    return rows;
  }

  async createAdminAnnouncement(announcement: {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'urgent';
    isPublished: boolean;
    isDismissible: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    createdBy: number;
  }) {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO system_announcements
       (title, message, type, is_published, is_dismissible, starts_at, ends_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [announcement.title, announcement.message, announcement.type, announcement.isPublished,
        announcement.isDismissible, announcement.startsAt, announcement.endsAt, announcement.createdBy],
    );
    return result.insertId;
  }

  async updateAdminAnnouncement(id: number, announcement: {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'urgent';
    isPublished: boolean;
    isDismissible: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  }) {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      `UPDATE system_announcements SET title = ?, message = ?, type = ?,
       is_published = ?, is_dismissible = ?, starts_at = ?, ends_at = ? WHERE id = ?`,
      [announcement.title, announcement.message, announcement.type, announcement.isPublished,
        announcement.isDismissible, announcement.startsAt, announcement.endsAt, id],
    );
    return result.affectedRows > 0;
  }

  async deleteAdminAnnouncement(id: number) {
    const pool = this.requirePool();
    const [result] = await pool.query<mysql.ResultSetHeader>(
      'DELETE FROM system_announcements WHERE id = ?', [id],
    );
    return result.affectedRows > 0;
  }

  async listUserAnnouncements(userId: number) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT a.id, a.title, a.message, a.type,
      a.is_dismissible AS isDismissible, a.starts_at AS startsAt, a.ends_at AS endsAt
      FROM system_announcements a
      LEFT JOIN user_announcement_dismissals d ON d.announcement_id = a.id AND d.user_id = ?
      WHERE a.is_published = TRUE
        AND (a.starts_at IS NULL OR a.starts_at <= CURRENT_TIMESTAMP(3))
        AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP(3))
        AND (a.is_dismissible = FALSE OR d.announcement_id IS NULL)
      ORDER BY FIELD(a.type, 'urgent', 'warning', 'info', 'success'), a.created_at DESC`,
    [userId]);
    return rows;
  }

  async dismissUserAnnouncement(userId: number, announcementId: number) {
    const pool = this.requirePool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM system_announcements WHERE id = ? AND is_published = TRUE
       AND is_dismissible = TRUE AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP(3))
       AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP(3)) LIMIT 1`,
      [announcementId],
    );
    if (!rows[0]) return false;
    await pool.query(
      `INSERT INTO user_announcement_dismissals (user_id, announcement_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE dismissed_at = CURRENT_TIMESTAMP(3)`,
      [userId, announcementId],
    );
    return true;
  }
}
