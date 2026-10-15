import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { config, validateDeployConfig } from './config.js';

try {
  validateDeployConfig();
  const rest = new REST({ version: '10' }).setToken(config.token);
  console.log(`Registering ${commands.length} EventPilot commands...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Commands registered successfully.');
} catch (error) {
  console.error('Could not deploy commands:', error.message);
  process.exitCode = 1;
}
