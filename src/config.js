import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  eventChannelId: process.env.EVENT_CHANNEL_ID || null,
};

export function validateRuntimeConfig() {
  if (!config.token) {
    throw new Error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  }
}

export function validateDeployConfig() {
  const missing = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}
