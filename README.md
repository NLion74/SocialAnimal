# SocialAnimal 🐾

> Name inspired by _The Social Animal_ by Elliot Aronson - no real psychological correlation, just a fitting name.

SocialAnimal is a **self-hosted social calendar platform** that lets you share your calendar with friends. This is **not** a self-hosted calendar server - tools like [Radicale](https://radicale.org/) do that job well. SocialAnimal sits on top: you and your friends log in, import your existing calendars, and share them with each other - with full control over what they can see.

Friends can view shared calendars directly inside the app, or export them as an ICS link into their own calendar client.

---

![Main page](assets/main-page.png)

---

## Current State - v0.1.0

This is an early release. Current features include:

- **Friend system** - send, accept, and decline friend requests
- **Auth & admin** - login system with admin settings, invite-only or open registration, salted password hashing
- **Calendar import** - import any ICS/iCal feed by URL (Google Calendar, Apple, Outlook, Fastmail, etc.)
- **Calendar export** - export shared calendars as ICS links for use in any calendar client
- **Sync jobs** - calendars sync automatically on a configurable interval (in minutes)
- **Calendar view** - month, week, and day views showing your events and friends' events side-by-side
- **Permission system** - control per-calendar, per-friend what level of detail is shared:
    - 🔴 **Busy only** - time blocks visible, no details
    - 🟡 **Titles only** - event names visible, no description or location
    - 🟢 **Full details** - everything visible
- **Profile & settings** - change password, set default sharing permissions and other preferences

|                                    |                                                |
| ---------------------------------- | ---------------------------------------------- |
| ![Dashboard](assets/dashboard.png) | ![Share with menu](assets/share-with-menu.png) |
| _Calendar dashboard_               | _Per-friend sharing controls_                  |
| ![Profile](assets/profile.png)     | ![Calendar](assets/calendar.png)               |
| _Profile settings_                 | _Calendar view_                                |

---

## Roadmap

- [ ] API tests
- [ ] Edit added calendars
- [ ] Google Calendar provider
- [ ] Proton Calendar provider
- [ ] Apple Calendar provider
- [ ] CalDAV support
- [ ] Research and add other common calendar providers
- [ ] Per-event permission overrides or event exclusions
- [ ] GitHub Actions workflow for publishing Docker image
- [ ] Better admin management

---

## Getting Started

Pull the compose file and start:

```bash
curl -O https://raw.githubusercontent.com/NLion74/SocialAnimal/refs/heads/main/docker-compose.yml
docker-compose up
```

---

## Contributing

This project is in early development and contributions are very much appreciated! Feel free to open issues, suggest features, or submit pull requests.

```bash
git clone https://github.com/NLion74/SocialAnimal.git
cd SocialAnimal

docker-compose -f dev-docker-compose.yml up --build
```

Frontend: http://localhost:3001  
Backend API: http://localhost:3001/api
