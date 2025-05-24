const { Client, GatewayIntentBits, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const fs = require('fs-extra');
const config = require('./config.json');
let idler = require('./idler.json');
const { joinVoiceChannel: discordJoinVoiceChannel } = require('@discordjs/voice');

const STREAMER_MODE = process.env.NODE_ENV === 'streamer';

if (STREAMER_MODE) {
    console.log('===================================');
    console.log('    STREAMER MODU AKTIF EDILDI    ');
    console.log('  IDler ve İsimler Gizlenecektir  ');
    console.log('===================================');
}

function safeLog(message, sensitiveData) {
    if (STREAMER_MODE && sensitiveData) {
        let sanitizedMsg = message;
        if (typeof sensitiveData === 'string') {
            sanitizedMsg = message.replace(new RegExp(sensitiveData, 'g'), '***GIZLI***');
        } else if (Array.isArray(sensitiveData)) {
            sensitiveData.forEach(data => {
                if (data && typeof data === 'string') {
                    sanitizedMsg = sanitizedMsg.replace(new RegExp(data, 'g'), '***GIZLI***');
                }
            });
        }
        console.log(sanitizedMsg);
    } else {
        console.log(message);
    }
}

function safeError(message, sensitiveData) {
    if (STREAMER_MODE && sensitiveData) {
        let sanitizedMsg = message;
        if (typeof sensitiveData === 'string') {
            sanitizedMsg = message.replace(new RegExp(sensitiveData, 'g'), '***GIZLI***');
        } else if (Array.isArray(sensitiveData)) {
            sensitiveData.forEach(data => {
                if (data && typeof data === 'string') {
                    sanitizedMsg = sanitizedMsg.replace(new RegExp(data, 'g'), '***GIZLI***');
                }
            });
        }
        console.error(sanitizedMsg);
    } else {
        console.error(message);
    }
}

const normalBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

const selfbotClients = [];
let botVoiceStatus = {};
let activeClients = new Set();

config.users.forEach((user, index) => {
    const client = new SelfbotClient({
        checkUpdate: false,
        friendSources: false
    });
    client.userId = user.id;
    client.userToken = user.token;
    client.index = index + 1;
    selfbotClients.push(client);
});

function joinVoiceChannel(client, channelId) {
    if (!client || !client.user) {
        safeError("Geçersiz client objesi: Ses kanalına katılınamadı", null);
        return false;
    }
    if (botVoiceStatus[client.userId] === channelId) {
        safeLog(`Bot zaten ${channelId} kanalında bağlı. Tekrar bağlanmaya gerek yok.`, channelId);
        return true;
    }
    const GUILD_ID = config.guildId;
    const ws = client.ws;
    if (!ws) {
        safeError(`WebSocket connection not found for ${client.user.tag}`, client.user.tag);
        return false;
    }
    try {
        ws.broadcast({
            op: 4,
            d: {
                guild_id: GUILD_ID,
                channel_id: channelId,
                self_mute: false,
                self_deaf: false
            }
        });
        safeLog(`Voice state update sent for ${client.user.tag} to join channel ${channelId}`, [client.user.tag, channelId]);
        botVoiceStatus[client.userId] = channelId;
        return true;
    } catch (error) {
        safeError(`Failed to send voice state update for ${client.user.tag}: ${error}`, client.user.tag);
        return false;
    }
}

function leaveVoiceChannel(client) {
    if (!client || !client.user) {
        safeError("Geçersiz client objesi: Ses kanalından çıkış yapılamadı", null);
        return false;
    }
    const GUILD_ID = config.guildId;
    const ws = client.ws;
    if (!ws) {
        safeError(`WebSocket connection not found for ${client.user.tag}`, client.user.tag);
        return false;
    }
    try {
        ws.broadcast({
            op: 4,
            d: {
                guild_id: GUILD_ID,
                channel_id: null,
                self_mute: false,
                self_deaf: false
            }
        });
        safeLog(`Voice state update sent for ${client.user.tag} to leave voice`, client.user.tag);
        botVoiceStatus[client.userId] = null;
        return true;
    } catch (error) {
        safeError(`Failed to send voice state update for ${client.user.tag} to leave: ${error}`, client.user.tag);
        return false;
    }
}

selfbotClients.forEach(client => {
    client.on('ready', () => {
        safeLog(`Selfbot ${client.index} logged in as ${client.user.tag} (${client.userId})`, [client.user.tag, client.userId]);
        botVoiceStatus[client.userId] = null;
        activeClients.add(client.index);
    });
    client.login(client.userToken).catch(err => {
        safeError(`Failed to login selfbot ${client.index} with token for user ID ${client.userId}: ${err}`, [client.userId, client.userToken]);
    });
    client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.member.id === client.user.id) {
            botVoiceStatus[client.userId] = newState.channelId;
        }
    });
});

normalBot.on('ready', () => {
    safeLog(`Normal bot logged in as ${normalBot.user.tag}`, normalBot.user.tag);
});

normalBot.on('messageCreate', async (message) => {
    if (!message.content.startsWith(config.bot.prefix)) return;
    const args = message.content.slice(config.bot.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    if (command === 'premium') {
        if (!config.admins.includes(message.author.id)) {
            return message.reply('Bu komutu kullanma yetkiniz yok!');
        }
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;
        selfbotClients.forEach((client, index) => {
            if (!activeClients.has(client.index)) return;
            if (buttonCount > 0 && buttonCount % 5 === 0) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            const isInVoice = botVoiceStatus[client.userId] !== null;
            const button = new ButtonBuilder()
                .setCustomId(`selfbot_${index + 1}`)
                .setLabel(`${index + 1}`)
                .setStyle(isInVoice ? ButtonStyle.Success : ButtonStyle.Danger);
            currentRow.addComponents(button);
            buttonCount++;
        });
        if (currentRow.components.length > 0) {
            rows.push(currentRow);
        }
        const premiumEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Premium Ses Kontrolü')
            .setDescription('Aşağıdaki düğmelere tıklayarak ses kanallarına bağlanabilirsiniz.')
            .setTimestamp()
            .setFooter({ text: 'Developer lightningpremium' });

        await message.channel.send({ embeds: [premiumEmbed], components: rows });

        const allButtonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('all_join')
                    .setLabel('ALL')
                    .setStyle(ButtonStyle.Primary)
            );

        const allEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Toplu Bağlantı')
            .setDescription('Tüm hesapları aynı anda ses kanalına bağlamak için ALL düğmesine tıklayın.')
            .setTimestamp()
            .setFooter({ text: 'Developer lightningpremium' });

        await message.channel.send({ embeds: [allEmbed], components: [allButtonRow] });
    } else if (command === 'idayarla') {
        if (!config.admins.includes(message.author.id)) {
            return message.reply('Bu komutu kullanma yetkiniz yok!');
        }
        await message.channel.send('Lütfen her kullanıcı için ses kanalı ID\'sini girin. "iptal" yazarak işlemi iptal edebilirsiniz.');
        for (let i = 0; i < selfbotClients.length; i++) {
            const client = selfbotClients[i];
            if (!activeClients.has(client.index)) continue;
            await message.channel.send(`Kullanıcı ${i + 1} (${client.userId}) için ses kanalı ID'sini girin:`);
            const filter = m => m.author.id === message.author.id;
            try {
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                const response = collected.first().content;
                if (response.toLowerCase() === 'iptal') {
                    return message.channel.send('ID ayarlama işlemi iptal edildi.');
                }
                idler[`${i + 1}_vc_id`] = response;
                fs.writeFileSync('./idler.json', JSON.stringify(idler, null, 4));
                await message.channel.send(`Kullanıcı ${i + 1} için ses kanalı ID'si ayarlandı: ${response}`);
            } catch (error) {
                return message.channel.send('Zaman aşımı veya bir hata oluştu, ID ayarlama işlemi iptal edildi.');
            }
        }
        await message.channel.send('Tüm kullanıcılar için ses kanalı ID\'leri ayarlandı!');
    }
});

normalBot.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'all_join' || interaction.customId.startsWith('selfbot_')) {
            if (!config.admins.includes(interaction.user.id)) {
                return interaction.reply({ content: 'Bu butonu kullanma yetkiniz yok!', ephemeral: true });
            }
            if (interaction.customId === 'all_join') {
                await interaction.deferUpdate();
                for (let i = 0; i < selfbotClients.length; i++) {
                    const client = selfbotClients[i];
                    if (!activeClients.has(client.index)) continue;
                    const channelId = idler[`${i + 1}_vc_id`];
                    if (botVoiceStatus[client.userId] === null) {
                        joinVoiceChannel(client, channelId);
                    } else {
                        leaveVoiceChannel(client);
                    }
                }
                await interaction.followUp({ content: 'Tüm kullanıcıların ses durumu değiştirildi!', ephemeral: true });
                return;
            }
            if (interaction.customId.startsWith('selfbot_')) {
                await interaction.deferUpdate();
                const index = parseInt(interaction.customId.split('_')[1]) - 1;
                const client = selfbotClients[index];
                if (!client || !activeClients.has(client.index)) {
                    return interaction.followUp({ content: 'Bu kullanıcı bulunamadı veya aktif değil!', ephemeral: true });
                }
                const channelId = idler[`${index + 1}_vc_id`];
                if (botVoiceStatus[client.userId] === null) {
                    joinVoiceChannel(client, channelId);
                    await interaction.followUp({ content: `Kullanıcı ${index + 1} ses kanalına bağlandı!`, ephemeral: true });
                } else {
                    leaveVoiceChannel(client);
                    await interaction.followUp({ content: `Kullanıcı ${index + 1} ses kanalından çıkarıldı!`, ephemeral: true });
                }
            }
        }
    }
});

normalBot.login(config.bot.token);