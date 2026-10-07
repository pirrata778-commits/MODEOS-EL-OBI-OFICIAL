const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const connectDB = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('✅ Conectado exitosamente a Neon PostgreSQL');

        await client.query(`
            CREATE TABLE IF NOT EXISTS guild_configs (
                guild_id VARCHAR(32) PRIMARY KEY,
                welcome_channel_id VARCHAR(32) DEFAULT NULL,
                welcome_message TEXT DEFAULT '¡Bienvenido/a {user} a MODEOS EL OBI OFFICIAL!',
                welcome_title VARCHAR(150) DEFAULT '✨ ⊱┆ BIENVENIDO/A A {server} ┆⊰ ✨',
                welcome_color VARCHAR(7) DEFAULT '#5865F2',
                welcome_banner_url TEXT DEFAULT NULL,
                welcome_enable_canvas BOOLEAN DEFAULT TRUE,
                welcome_enable_buttons BOOLEAN DEFAULT TRUE,
                admin_alert_channel_id VARCHAR(32) DEFAULT NULL,
                admin_scanner_enabled BOOLEAN DEFAULT TRUE,
                verify_role_id VARCHAR(32) DEFAULT NULL,
                suggestion_channel_id VARCHAR(32) DEFAULT NULL,
                log_channel_id VARCHAR(32) DEFAULT NULL,
                quarantine_role_id VARCHAR(32) DEFAULT NULL,
                voice_generator_channel_id VARCHAR(32) DEFAULT NULL,
                social_channel_id VARCHAR(32) DEFAULT NULL,
                staff_review_channel_id VARCHAR(32) DEFAULT NULL,
                vip_role_id VARCHAR(32) DEFAULT NULL,
                rules_channel_id VARCHAR(32) DEFAULT NULL
            );
        `);

        await client.query(`
            ALTER TABLE guild_configs
            ADD COLUMN IF NOT EXISTS suggestion_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS log_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS welcome_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT '¡Bienvenido/a {user} a MODEOS EL OBI OFFICIAL!',
            ADD COLUMN IF NOT EXISTS welcome_title VARCHAR(150) DEFAULT '✨ ⊱┆ BIENVENIDO/A A {server} ┆⊰ ✨',
            ADD COLUMN IF NOT EXISTS welcome_color VARCHAR(7) DEFAULT '#5865F2',
            ADD COLUMN IF NOT EXISTS welcome_banner_url TEXT DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS welcome_enable_canvas BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS welcome_enable_buttons BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS admin_alert_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS admin_scanner_enabled BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS verify_role_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS quarantine_role_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS voice_generator_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS social_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS staff_review_channel_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS vip_role_id VARCHAR(32) DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS rules_channel_id VARCHAR(32) DEFAULT NULL;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                target_user_id VARCHAR(32) NOT NULL,
                author_id VARCHAR(32) NOT NULL,
                rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                comment TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS sanctions (
                id SERIAL PRIMARY KEY,
                guild_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(32) NOT NULL,
                moderator_id VARCHAR(32) NOT NULL,
                type VARCHAR(20) NOT NULL,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS suggestion_votes (
                message_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(32) NOT NULL,
                vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, user_id)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS temporary_voice_channels (
                channel_id VARCHAR(32) PRIMARY KEY,
                guild_id VARCHAR(32) NOT NULL,
                owner_id VARCHAR(32) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS access_logs (
                id SERIAL PRIMARY KEY,
                source VARCHAR(20) NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                guild_id VARCHAR(32) NULL,
                user_id VARCHAR(32) NOT NULL,
                user_tag VARCHAR(100) NULL,
                ip_address VARCHAR(45) NULL,
                details TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS guild_commands (
                id SERIAL PRIMARY KEY,
                guild_id VARCHAR(32) NOT NULL,
                command_name VARCHAR(50) NOT NULL,
                enabled BOOLEAN DEFAULT true,
                required_roles TEXT[] DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (guild_id, command_name)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS ticket_transcripts (
                id SERIAL PRIMARY KEY,
                guild_id VARCHAR(32) NOT NULL,
                channel_id VARCHAR(32) NOT NULL,
                owner_id VARCHAR(32) NOT NULL,
                closed_by_id VARCHAR(32) NOT NULL,
                message_count INTEGER NOT NULL DEFAULT 0,
                messages JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            ALTER TABLE ticket_transcripts
            ADD COLUMN IF NOT EXISTS messages JSONB;
        `);
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'ticket_transcripts'
                      AND column_name = 'transcript'
                ) THEN
                    EXECUTE $migration$
                        UPDATE ticket_transcripts
                        SET messages = jsonb_build_array(
                            jsonb_build_object('content', transcript, 'legacy', true)
                        )
                        WHERE transcript IS NOT NULL
                          AND (messages IS NULL OR messages = '[]'::jsonb)
                    $migration$;
                END IF;
            END $$;
        `);
        await client.query(`
            UPDATE ticket_transcripts SET messages = '[]'::jsonb WHERE messages IS NULL;
            ALTER TABLE ticket_transcripts
                ALTER COLUMN messages SET DEFAULT '[]'::jsonb,
                ALTER COLUMN messages SET NOT NULL,
                DROP COLUMN IF EXISTS transcript;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS ticket_ratings (
                id SERIAL PRIMARY KEY,
                transcript_id INTEGER NOT NULL UNIQUE REFERENCES ticket_transcripts(id) ON DELETE CASCADE,
                guild_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(32) NOT NULL,
                rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_events (
                event_id VARCHAR(100) PRIMARY KEY,
                guild_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(32) NOT NULL,
                role_id VARCHAR(32) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            DELETE FROM guild_commands AS old_command
            USING (VALUES
                ('scan_avise_admin', 'escanear_admins'),
                ('announce', 'anuncio'),
                ('ejecute_admin_scann', 'ejecutar_escaneo'),
                ('global_scann_adm', 'escaneo_global_admins'),
                ('help', 'ayuda'),
                ('logs_configurar', 'configurar_logs'),
                ('mute', 'silenciar'),
                ('owner', 'dueno_transmision'),
                ('review', 'resena'),
                ('rolemenu', 'menu_roles'),
                ('setup_verify', 'configurar_verificacion'),
                ('sugerencias_configurar', 'configurar_sugerencias'),
                ('ticket_setup', 'configurar_tickets'),
                ('unmute', 'desilenciar'),
                ('verify', 'verificar'),
                ('warn', 'advertencia')
            ) AS renamed(old_name, new_name)
            WHERE old_command.command_name = renamed.old_name
              AND EXISTS (
                  SELECT 1 FROM guild_commands AS current_command
                  WHERE current_command.guild_id = old_command.guild_id
                    AND current_command.command_name = renamed.new_name
              );
        `);
        await client.query(`
            UPDATE guild_commands AS configured_command
            SET command_name = renamed.new_name,
                updated_at = CURRENT_TIMESTAMP
            FROM (VALUES
                ('scan_avise_admin', 'escanear_admins'),
                ('announce', 'anuncio'),
                ('ejecute_admin_scann', 'ejecutar_escaneo'),
                ('global_scann_adm', 'escaneo_global_admins'),
                ('help', 'ayuda'),
                ('logs_configurar', 'configurar_logs'),
                ('mute', 'silenciar'),
                ('owner', 'dueno_transmision'),
                ('review', 'resena'),
                ('rolemenu', 'menu_roles'),
                ('setup_verify', 'configurar_verificacion'),
                ('sugerencias_configurar', 'configurar_sugerencias'),
                ('ticket_setup', 'configurar_tickets'),
                ('unmute', 'desilenciar'),
                ('verify', 'verificar'),
                ('warn', 'advertencia')
            ) AS renamed(old_name, new_name)
            WHERE configured_command.command_name = renamed.old_name;
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS reviews_target_created_idx
            ON reviews (target_user_id, created_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS sanctions_guild_created_idx
            ON sanctions (guild_id, created_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS temporary_voice_guild_idx
            ON temporary_voice_channels (guild_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS access_logs_guild_action_created_idx
            ON access_logs (guild_id, action_type, created_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS ticket_ratings_guild_created_idx
            ON ticket_ratings (guild_id, created_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS ticket_transcripts_guild_created_idx
            ON ticket_transcripts (guild_id, created_at DESC);
        `);

        console.log('✅ Esquema e índices de Neon DB verificados');
    } catch (error) {
        console.error('❌ Error al conectar a Neon DB:', error.message);
        throw error;
    } finally {
        client?.release();
    }
};

module.exports = { pool, connectDB };