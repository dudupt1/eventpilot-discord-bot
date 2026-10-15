# EventPilot — Discord Events & Registration Bot

EventPilot is a Discord community event bot built with JavaScript, Node.js and discord.js. It publishes interactive event cards and manages registrations, capacity, waitlists and check-in.

## Features

- Validated dates and 24-hour times.
- Interactive event cards with Join, Leave and Check in buttons.
- Capacity limits and automatic waitlist promotion.
- Event details and attendance statistics.
- Event owner and server-manager controls.
- Persistent local JSON data.
- Unit tests for calendar validation and waitlist promotion.

## Setup

```bash
npm install
cp .env.example .env
npm run check
npm test
npm run deploy
npm start
```

## Configuration

```env
DISCORD_TOKEN=your_private_token
CLIENT_ID=your_application_id
GUILD_ID=your_test_server_id
EVENT_CHANNEL_ID=
```

`EVENT_CHANNEL_ID` is optional. When blank, event cards are published in the command channel.
