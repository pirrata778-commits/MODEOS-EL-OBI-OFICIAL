const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');

const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function createCaptchaChallenge(userId, guildId) {
    const left = Math.floor(Math.random() * 8) + 2;
    const right = Math.floor(Math.random() * 8) + 2;
    const answer = String(left + right);
    const challengeId = randomUUID();
    const choices = new Set([answer]);

    while (choices.size < 4) {
        choices.add(String(Math.floor(Math.random() * 16) + 2));
    }

    const options = [...choices]
        .sort(() => Math.random() - 0.5)
        .map(value => ({ label: value, value }));
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`captcha_answer:${challengeId}`)
        .setPlaceholder(`Resuelve: ${left} + ${right}`)
        .addOptions(options);
    challenges.set(challengeId, {
        answer,
        userId,
        guildId,
        expiresAt: Date.now() + CHALLENGE_TTL_MS
    });

    for (const [id, challenge] of challenges) {
        if (challenge.expiresAt <= Date.now()) challenges.delete(id);
    }

    return {
        content: 'Selecciona la respuesta correcta. El captcha solo es visible para ti.',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
    };
}

function consumeCaptchaChallenge(challengeId, userId, guildId, answer) {
    const challenge = challenges.get(challengeId);
    challenges.delete(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()
        || challenge.userId !== userId || challenge.guildId !== guildId) {
        return false;
    }
    return challenge.answer === answer;
}

module.exports = { createCaptchaChallenge, consumeCaptchaChallenge };
