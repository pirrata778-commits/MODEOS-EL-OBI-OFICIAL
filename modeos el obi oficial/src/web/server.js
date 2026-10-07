const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const client = require('../bot/client');

const frontendUrl = process.env.FRONTEND_URL || 'https://web-modeos-el-obi.onrender.com';
const app = express();
app.locals.discordClient = client;

app.use(cors({
    origin: new URL(frontendUrl).origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'public')));
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ success: false, error: 'El cuerpo JSON no es válido.' });
    }
    console.error('Error no controlado en la API web:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
});

app.get('/ping', (req, res) => {
    res.status(200).send('API de MODEOS EL OBI OFFICIAL lista');
});

app.get('*', (req, res) => {
    const publicPath = path.join(__dirname, '..', '..', 'public', 'index.html');
    if (fs.existsSync(publicPath)) {
        return res.sendFile(publicPath);
    }
    return res.json({ message: 'API de MODEOS EL OBI OFFICIAL activa. Panel Web en construcción.' });
});

const startWebServer = () => {
    const port = process.env.PORT || 10000;
    const server = app.listen(port, () => {
        console.log(`🌐 API y Web escuchando en el puerto ${port}`);
    });
    server.on('error', error => {
        console.error(`No se pudo iniciar el servidor web en el puerto ${port}:`, error);
        process.exitCode = 1;
    });
    return server;
};

module.exports = startWebServer;
