# SocialAnimal 🐾

> Name inspired by _The Social Animal_ by Elliot Aronson - no real psychological correlation, just a fitting name.

SocialAnimal is a **self-hosted social calendar platform** that lets you share your calendar with friends. This is **not** a self-hosted calendar server - tools like [Radicale](https://radicale.org/) do that job well. SocialAnimal sits on top: you and your friends log in, import your existing calendars, and share them with each other - with full control over what they can see.

Friends can view shared calendars directly inside the app, or export them as an ICS link into their own calendar client.

---

## Current State - v0.1.0

This is an early release. Current features include:

- **Friend system** - send, accept, and decline friend requests
- **Auth & admin** - login system with admin settings
- **Calendar import** - import any ICS/iCal feed by URL (Google Calendar, Apple, Outlook, Fastmail, etc.)
- **Calendar export** - export shared calendars as ICS links for use in any calendar client
- **Sync jobs** - calendars sync automatically on a configurable interval
- **Calendar view** - month, week, and day views showing your events and friends events side-by-side
- **Permission system** - control per-calendar, per-friend what level of detail is shared:
    - 🔴 **Busy only** - time blocks visible, no details
    - 🟡 **Titles only** - event names visible, no description or location
    - 🟢 **Full details** - everything visible

## Roadmap

- Support for dedicated calendar provider imports (Google Calendar, Proton Calendar, Apple Calendar, etc.)
- Possibly additional export modes - research ongoing
- Possibly a way of excluding singular events or changing their permission individually

## Getting Started

```bash
# Clone the repo
curl -O github.com/NLion74/SocialAnimal/refs/heads/main/docker-compose.yml

# Start all services
docker-compose -f docker-compose.yml up
```

---

## Contributing

This project is in early development and contributions are very much appreciated! Feel free to open issues, suggest features, or submit pull requests.

```bash
# Clone the repo
git clone https://github.com/your-org/socialanimal.git
cd socialanimal

# Start all services
docker-compose -f dev-docker-compose.yml up --build
```

Frontend: http://localhost:3001  
Backend API: http://localhost:3000 or http://localhost:3001/api

---
