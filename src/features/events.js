import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { mutate, snapshot } from '../storage.js';

const BUTTON_PREFIX = 'eventpilot';
const statusStyle = {
  open: { label: 'Registration open', color: 0x57f287, emoji: '🟢' },
  closed: { label: 'Registration closed', color: 0x747f8d, emoji: '🔒' },
  cancelled: { label: 'Cancelled', color: 0xed4245, emoji: '⛔' },
};

function eventId() {
  return randomUUID().split('-')[0];
}

function eventsFor(data, guildId) {
  return data.events[guildId] ?? {};
}

function canManage(interaction, event) {
  return event.createdBy === interaction.user.id || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

export function validateEventSchedule(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const candidate = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(candidate.getTime()) || candidate.toISOString().slice(0, 10) !== date || candidate.toISOString().slice(11, 16) !== time) {
    return null;
  }

  return { date, time, sortKey: `${date}T${time}:00` };
}

/** Adds a member to confirmed places or a waitlist, never both. */
export function applyRegistration(event, userId) {
  if (event.status !== 'open') return { result: 'not-open' };
  if (event.attendees.includes(userId)) return { result: 'already-confirmed' };
  if (event.waitlist.includes(userId)) return { result: 'already-waitlisted' };

  if (event.attendees.length < event.capacity) {
    event.attendees.push(userId);
    return { result: 'confirmed' };
  }

  event.waitlist.push(userId);
  return { result: 'waitlisted' };
}

export function applyLeave(event, userId) {
  const confirmedIndex = event.attendees.indexOf(userId);
  const waitlistIndex = event.waitlist.indexOf(userId);

  if (confirmedIndex === -1 && waitlistIndex === -1) return { result: 'not-registered' };

  event.checkedIn = event.checkedIn.filter((memberId) => memberId !== userId);
  if (confirmedIndex !== -1) {
    event.attendees.splice(confirmedIndex, 1);
    const promotedUserId = event.waitlist.shift() ?? null;
    if (promotedUserId) event.attendees.push(promotedUserId);
    return { result: 'left-confirmed', promotedUserId };
  }

  event.waitlist.splice(waitlistIndex, 1);
  return { result: 'left-waitlist', promotedUserId: null };
}

function applyCheckIn(event, userId) {
  if (event.status !== 'open') return { result: 'not-open' };
  if (!event.attendees.includes(userId)) return { result: 'not-confirmed' };
  if (event.checkedIn.includes(userId)) return { result: 'already-checked-in' };

  event.checkedIn.push(userId);
  return { result: 'checked-in' };
}

function eventEmbed(event, { includeMembers = false } = {}) {
  const status = statusStyle[event.status] ?? statusStyle.open;
  const fields = [
    { name: 'When', value: `📅 ${event.date} at ${event.time} (server time)`, inline: false },
    { name: 'Confirmed', value: `${event.attendees.length}/${event.capacity}`, inline: true },
    { name: 'Waitlist', value: String(event.waitlist.length), inline: true },
    { name: 'Checked in', value: String(event.checkedIn.length), inline: true },
    { name: 'Hosted by', value: `<@${event.createdBy}>`, inline: true },
    { name: 'Status', value: `${status.emoji} ${status.label}`, inline: true },
  ];

  if (includeMembers) {
    fields.push(
      {
        name: 'Confirmed attendees',
        value: event.attendees.length ? event.attendees.map((memberId) => `<@${memberId}>`).join(', ').slice(0, 1024) : 'Nobody has joined yet.',
        inline: false,
      },
      {
        name: 'Waitlist',
        value: event.waitlist.length ? event.waitlist.map((memberId) => `<@${memberId}>`).join(', ').slice(0, 1024) : 'Nobody is waiting.',
        inline: false,
      },
    );
  }

  return new EmbedBuilder()
    .setColor(status.color)
    .setTitle(event.title)
    .setDescription(event.description)
    .addFields(fields)
    .setFooter({ text: `Event ID: ${event.id} • Join, leave or check in below.` })
    .setTimestamp(new Date(event.createdAt));
}

function controls(event) {
  const locked = event.status !== 'open';
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:join:${event.id}`).setLabel('Join').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(locked),
      new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:leave:${event.id}`).setLabel('Leave').setEmoji('↩️').setStyle(ButtonStyle.Secondary).setDisabled(locked),
      new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}:checkin:${event.id}`).setLabel('Check in').setEmoji('📍').setStyle(ButtonStyle.Primary).setDisabled(locked),
    ),
  ];
}

async function resolveEventChannel(guild, fallback) {
  if (!config.eventChannelId) return fallback;
  const configured = await guild.channels.fetch(config.eventChannelId).catch(() => null);
  return configured?.isTextBased() ? configured : fallback;
}

async function syncEventCard(guild, event) {
  const channel = await guild.channels.fetch(event.channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  if (!message) return false;

  await message.edit({ embeds: [eventEmbed(event)], components: controls(event) });
  return true;
}

export function isEventButton(interaction) {
  return interaction.customId?.startsWith(`${BUTTON_PREFIX}:`);
}

export async function handleEventCommand(interaction) {
  const action = interaction.options.getSubcommand();

  if (action === 'create') {
    const title = interaction.options.getString('title', true).trim();
    const description = interaction.options.getString('description', true).trim();
    const schedule = validateEventSchedule(interaction.options.getString('date', true), interaction.options.getString('time', true));
    const capacity = interaction.options.getInteger('capacity', true);

    if (!schedule) {
      await interaction.reply({ content: 'Use a real date and time, for example `2026-11-03` and `19:30`.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const targetChannel = await resolveEventChannel(interaction.guild, interaction.channel);
    if (!targetChannel?.isTextBased()) throw new Error('No text channel is available for this event.');

    const event = {
      id: eventId(),
      title,
      description,
      ...schedule,
      capacity,
      createdBy: interaction.user.id,
      channelId: targetChannel.id,
      messageId: null,
      status: 'open',
      attendees: [],
      waitlist: [],
      checkedIn: [],
      createdAt: new Date().toISOString(),
    };

    const message = await targetChannel.send({ embeds: [eventEmbed(event)], components: controls(event) });
    event.messageId = message.id;
    mutate((data) => {
      data.events[interaction.guildId] ??= {};
      data.events[interaction.guildId][event.id] = event;
    });

    await interaction.editReply(`Event **${event.title}** was published in ${targetChannel}. Its ID is \`${event.id}\`.`);
    return;
  }

  const data = snapshot();
  const guildEvents = eventsFor(data, interaction.guildId);

  if (action === 'list') {
    const active = Object.values(guildEvents)
      .filter((event) => event.status === 'open')
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    const description = active.length
      ? active.slice(0, 15).map((event) => `• \`${event.id}\` **${event.title}** — ${event.date} ${event.time} • ${event.attendees.length}/${event.capacity}`).join('\n')
      : 'There are no open events. Create one with `/event create`.';

    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('Upcoming events').setDescription(description)] });
    return;
  }

  const id = interaction.options.getString('id', true).toLowerCase();
  const event = guildEvents[id];
  if (!event) {
    await interaction.reply({ content: 'Event not found. Run `/event list` and copy a valid ID.', ephemeral: true });
    return;
  }

  if (action === 'details') {
    await interaction.reply({ embeds: [eventEmbed(event, { includeMembers: true })], ephemeral: true });
    return;
  }

  if (action === 'stats') {
    const checkInRate = event.attendees.length ? Math.round((event.checkedIn.length / event.attendees.length) * 100) : 0;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`${event.title} — attendance stats`)
          .addFields(
            { name: 'Confirmed', value: `${event.attendees.length}/${event.capacity}`, inline: true },
            { name: 'Waitlist', value: String(event.waitlist.length), inline: true },
            { name: 'Check-in rate', value: `${checkInRate}%`, inline: true },
          )
          .setFooter({ text: `Event ID: ${event.id}` }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (!canManage(interaction, event)) {
    await interaction.reply({ content: 'Only the event host or a server manager can close or cancel this event.', ephemeral: true });
    return;
  }

  const status = action === 'close' ? 'closed' : 'cancelled';
  let updated;
  mutate((current) => {
    updated = current.events[interaction.guildId][id];
    updated.status = status;
    updated.updatedAt = new Date().toISOString();
  });

  await syncEventCard(interaction.guild, updated);
  await interaction.reply(status === 'closed' ? `Registrations for **${event.title}** are now closed.` : `**${event.title}** was cancelled and its buttons were disabled.`);
}

export async function handleEventButton(interaction) {
  const [, action, id] = interaction.customId.split(':');
  const data = snapshot();
  const event = eventsFor(data, interaction.guildId)[id];

  if (!event || event.messageId !== interaction.message.id) {
    await interaction.reply({ content: 'This event card is no longer active.', ephemeral: true });
    return;
  }

  let outcome;
  let updated;
  mutate((current) => {
    updated = current.events[interaction.guildId][id];
    if (action === 'join') outcome = applyRegistration(updated, interaction.user.id);
    if (action === 'leave') outcome = applyLeave(updated, interaction.user.id);
    if (action === 'checkin') outcome = applyCheckIn(updated, interaction.user.id);
    updated.updatedAt = new Date().toISOString();
  });

  const outcomeMessage = {
    confirmed: 'You are registered for this event.',
    waitlisted: 'The event is full, so you were added to the waitlist.',
    'already-confirmed': 'You are already confirmed for this event.',
    'already-waitlisted': 'You are already on the waitlist.',
    'left-confirmed': outcome?.promotedUserId ? 'You left the event. The next person was promoted from the waitlist.' : 'You left the event.',
    'left-waitlist': 'You left the waitlist.',
    'not-registered': 'You were not registered for this event.',
    'checked-in': 'You are checked in. Have fun!',
    'already-checked-in': 'You are already checked in.',
    'not-confirmed': 'Only confirmed attendees can check in.',
    'not-open': 'Registration is no longer open for this event.',
  }[outcome?.result] ?? 'The event could not be updated.';

  await interaction.update({ embeds: [eventEmbed(updated)], components: controls(updated) });
  await interaction.followUp({ content: outcomeMessage, ephemeral: true });
}
