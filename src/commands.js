import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const eventId = (option) =>
  option.setName('id').setDescription('The event ID shown by /event list.').setMinLength(8).setMaxLength(8).setRequired(true);

export const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create and manage community events.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Publish a new event card with registration buttons.')
        .addStringOption((option) => option.setName('title').setDescription('Clear event name.').setMinLength(3).setMaxLength(80).setRequired(true))
        .addStringOption((option) => option.setName('description').setDescription('What will happen at this event?').setMinLength(10).setMaxLength(1000).setRequired(true))
        .addStringOption((option) => option.setName('date').setDescription('Event date: YYYY-MM-DD.').setMinLength(10).setMaxLength(10).setRequired(true))
        .addStringOption((option) => option.setName('time').setDescription('Start time: HH:MM, 24-hour clock.').setMinLength(5).setMaxLength(5).setRequired(true))
        .addIntegerOption((option) => option.setName('capacity').setDescription('Number of confirmed places.').setMinValue(1).setMaxValue(100).setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('Show open upcoming events.'))
    .addSubcommand((subcommand) => subcommand.setName('details').setDescription('View event attendees and check-ins.').addStringOption(eventId))
    .addSubcommand((subcommand) => subcommand.setName('stats').setDescription('View attendance statistics.').addStringOption(eventId))
    .addSubcommand((subcommand) => subcommand.setName('close').setDescription('Close registrations and publish the final count.').addStringOption(eventId))
    .addSubcommand((subcommand) => subcommand.setName('cancel').setDescription('Cancel an event and disable registration.').addStringOption(eventId)),
].map((command) => command.toJSON());

export const managementPermission = PermissionFlagsBits.ManageGuild;
