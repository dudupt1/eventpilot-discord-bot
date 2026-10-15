import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config, validateRuntimeConfig } from './config.js';
import { handleEventButton, handleEventCommand, isEventButton } from './features/events.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function reportError(interaction) {
  const message = 'EventPilot could not finish that action. Please try again.';
  if (interaction.deferred) {
    await interaction.editReply({ content: message }).catch(() => null);
  } else if (interaction.replied) {
    await interaction.followUp({ content: message, ephemeral: true }).catch(() => null);
  } else {
    await interaction.reply({ content: message, ephemeral: true }).catch(() => null);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`EventPilot is online as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.inGuild()) {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'EventPilot can only be used inside a Discord server.', ephemeral: true });
      }
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'event') {
      await handleEventCommand(interaction);
      return;
    }

    if (interaction.isButton() && isEventButton(interaction)) {
      await handleEventButton(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);
    await reportError(interaction);
  }
});

try {
  validateRuntimeConfig();
  client.login(config.token);
} catch (error) {
  console.error(`EventPilot could not start: ${error.message}`);
  process.exitCode = 1;
}
