const express = require('express');
const router = express.Router();
const client = require('../../bot/client');

// Obtener lista de servidores en los que está el bot para el panel
router.get('/guilds', (req, res) => {
    try {
        const guilds = client.guilds.cache.map(guild => ({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount
        }));
        res.json({ success: true, guilds });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;