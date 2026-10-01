# SocialAnimal 🐾

![License](https://img.shields.io/github/license/NLion74/SocialAnimal)
![Stars](https://img.shields.io/github/stars/NLion74/SocialAnimal)
![Issues](https://img.shields.io/github/issues/NLion74/SocialAnimal)

![Docker Backend Pulls](https://img.shields.io/docker/pulls/nlion/socialanimal-backend)
![Docker Frontend Pulls](https://img.shields.io/docker/pulls/nlion/socialanimal-frontend)

> Name inspired by _The Social Animal_ by Elliot Aronson - no real psychological correlation, just a fitting name.

SocialAnimal is a **self-hosted social calendar platform** that lets you share your calendar with friends. This is **not** a self-hosted calendar server - tools like [Radicale](https://radicale.org/) do that job well. SocialAnimal sits on top: you and your friends log in, import your existing calendars, and share them with each other - with full control over what they can see.

Friends can view shared calendars directly inside the app, or export them as an ICS link into their own calendar client.

## Try it

A public instance is available at:

https://socialanimal.net

---

## Screenshots

### Dashboard Tab

![Dashboard](assets/dashboard.png)

### Calendar Tab

| Day                          | Week                          | Month                          |
| ---------------------------- | ----------------------------- | ------------------------------ |
| ![](assets/calendar-day.png) | ![](assets/calendar-week.png) | ![](assets/calendar-month.png) |

### Friends Tab

| Friend Request             | Share Menu                       |
| -------------------------- | -------------------------------- |
| ![](assets/friend-add.png) | ![](assets/friend-sharemenu.png) |

### Profile Tab

![](assets/profile.png)

### Landing Page

![](assets/main-page.png)

---

## Why SocialAnimal?

Many proprietary apps act as a social calendar, but usually require everyone to use their platform as a calendar provider.

But what if you want to keep using your existing calendar provider and simply share it with others?

SocialAnimal takes a different approach: it connects to your existing calendars and lets you share them with friends, family, or partners.

- View shared events directly in the app or export them back to your own calendar (planned feature - see [Roadmap](#roadmap))
- Fine-grained permissions let you control **exactly what you share, with whom, under which conditions** (planned feature - see [Roadmap](#roadmap))

## Current Features

**Accounts & Social**

- User authentication and profile settings
- Friend system (requests, accept/decline)

**Calendar Integration**

- Google Calendar import
- CalDAV / iCloud support
- ICS / iCal feed import
- ICS export for external calendar clients
- Revocable web preview links for people without an account

**Calendar Experience**

- Day, week, and month views
- Side-by-side view of your events and friends' calendars
- Toggle individual calendars in the sidebar

**Sharing & Permissions**

- Share calendars with friends
- Per-calendar visibility controls:
    - Busy only
    - Titles only
    - Full event details

**Automation**

- Automatic calendar sync on configurable intervals

## Roadmap

This project is not in a stable version as of yet. Stable release is planned for version v1.0.0.

Major architectural changes, severe bugs, or data loss are to be expected.

What is still planned:

- [ ] Easy integration for Proton, Outlook, Fastmail and possibly more
- [ ] Admin dashboard with user management
- [ ] Improved permission system (intuitive and advanced mode, possibly ABAC)
- [ ] More export types with direct push to calendars
- [ ] Better invite system (multiple codes, shareable invite links)
- [ ] Managing Events directly within the app (Own calendar provider type, would allow shared calendars multiple people can manage)
- [ ] Determine Shared Free Time
- [ ] Calendar color customization
- [ ] Email verification, two-factor authentication, and password reset
- [ ] Internal things like incremental sync, rate limiting...
- [ ] Many more small improvements...

---

## Setup

### Quick Start

Pull the compose file and example environment:

```bash
curl -O https://raw.githubusercontent.com/NLion74/SocialAnimal/refs/heads/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/NLion74/SocialAnimal/refs/heads/main/example.env

cp example.env .env
```

Edit .env with your configuration:

```bash
# See Google Calendar Setup below
GOOGLE_CLIENT_ID=clientid
GOOGLE_CLIENT_SECRET=clientsecret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/connections/google/callback

POSTGRES_PASSWORD="generate-with-openssl-rand-hex-32"
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/socialanimal"
JWT_SECRET="replace-with-a-random-secret"
CREDENTIAL_ENCRYPTION_KEY="generate-with-openssl-rand-hex-32-and-back-up"
SOCIALANIMAL_VERSION="your-published-release-tag"
NODE_ENV=production
FRONTEND_PORT=3000
PUBLIC_URL=http://localhost:3000
BACKEND_PORT=4000
```

Start the services:

```bash
docker compose up -d
```

The service will be available at `PUBLIC_URL`. Set `FRONTEND_PORT` to choose its host port. Containers use fixed internal ports; only the frontend is exposed in production. Keep the database password and encryption key stable when reusing a database.

### Google Calendar Setup (Optional)

To enable Google Calendar integration:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google Calendar API
4. APIs and services → OAuth Consent Screen
5. Under Data access, add scope .../auth/calendar.readonly, then save
6. Go to Clients and create a Client ID of type Web Application
7. Add authorized redirect URI: `https://your-public-url/api/v1/connections/google/callback`
8. Copy the Client ID and Client Secret to your .env file

Without Google credentials, users can still connect Apple Calendar (iCloud), CalDAV, or an ICS/iCal URL. For a calendar server on your private network, add its exact hostname or IP to `PRIVATE_PROVIDER_HOSTS` in your environment file. Other private network addresses are blocked.

## Development

This project is in early development and contributions are very much appreciated! For larger architectural changes or if you're unsure feel free to open an issue. Otherwise you may open a PR directly for smaller fixes, or even something larger but don't be disappointed if without further discussion in an issue your changes may not be merged

### Documentation

#### Tech Stack

- **Frontend:** Next JS, React, TypeScript
- **Backend:** Node JS, Fastify, TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Testing:** Vitest
- **Containerization:** Docker, Docker Compose

#### Backend API

The backend is a modular monolith with feature modules and shared `core/` infrastructure. The frontend uses feature screens and a generated TypeScript API client. See [architecture and boundaries](docs/architecture.md).

### Development Setup

To start a development instance use:

```bash
git clone https://github.com/NLion74/SocialAnimal.git
cd SocialAnimal

# Fill in POSTGRES_PASSWORD, JWT_SECRET and CREDENTIAL_ENCRYPTION_KEY.
cp example.env .env

node scripts/validate-compose.mjs development .env
docker compose --env-file .env -f dev-docker-compose.yml up --wait
```

Development uses source mounts, dependency/cache volumes, and live reload. It always runs with `NODE_ENV=development`; `BACKEND_PORT` and `DB_PORT` select host ports. To reuse an existing development database, retain its current PostgreSQL credentials and set `DEV_DATABASE_VOLUME` to its existing Docker volume name.

### Testing Production Build

```bash
git clone https://github.com/NLion74/SocialAnimal.git
cd SocialAnimal

# Configure secrets, PUBLIC_URL and SOCIALANIMAL_VERSION=local.
cp example.env .env.build

node scripts/validate-compose.mjs build .env.build
docker compose --env-file .env.build -f build-docker-compose.yml up --build --wait
```

Build Compose runs the production Dockerfiles without source mounts and uses its own `socialanimal-build` project. Choose a different `FRONTEND_PORT` and matching `PUBLIC_URL` in `.env.build` when development is also running. Always pass `--env-file .env.build` to build-stack commands.

`docker-compose.yml` pulls the published images tagged by `SOCIALANIMAL_VERSION`; it does not build source. `legacy-docker-compose.yml` is a compatibility filename for the same production services. Additional instances need a unique `-p NAME`, host ports, and `DATABASE_VOLUME` (or `DEV_DATABASE_VOLUME` for development). Build and production use separate database volumes by default; set `DATABASE_VOLUME` explicitly to reuse a database between them.

### Running Tests

```bash
cd backend
npm test

cd ../frontend
npm test
```
