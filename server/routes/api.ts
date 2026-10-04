import { Router } from 'express';
import { db } from '../db';
import { detectedAdmins, warns, blacklist } from '../db/schema';
import { getBotStats, client } from '../bot';
import { desc } from 'drizzle-orm';

const router = Router();

// 1. Endpoint para obtener el estado general del bot y contadores
router.get('/status', (req, res) => {
  try {
    const stats = getBotStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('❌ Error al obtener el estado del bot:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 2. Endpoint para obtener los administradores detectados guardados en la BD
router.get('/admins', async (req, res) => {
  try {
    const admins = await db.select().from(detectedAdmins);
    res.json({
      success: true,
      data: admins,
    });
  } catch (error) {
    console.error('❌ Error al obtener los administradores detectados:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 3. Endpoint para consultar las advertencias registradas (warns)
router.get('/warns', async (req, res) => {
  try {
    const warningList = await db.select().from(warns).orderBy(desc(warns.createdAt));
    res.json({
      success: true,
      data: warningList,
    });
  } catch (error) {
    console.error('❌ Error al obtener las advertencias:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 4. Endpoint para consultar la lista negra (blacklist)
router.get('/blacklist', async (req, res) => {
  try {
    const blacklistRecords = await db.select().from(blacklist);
    res.json({
      success: true,
      data: blacklistRecords,
    });
  } catch (error) {
    console.error('❌ Error al obtener la lista negra:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 5. Endpoint para listar los servidores en los que se encuentra el bot
router.get('/guilds', (req, res) => {
  try {
    const guilds = client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL(),
    }));
    res.json({
      success: true,
      data: guilds,
    });
  } catch (error) {
    console.error('❌ Error al obtener los servidores del bot:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

export const apiRouter = router;