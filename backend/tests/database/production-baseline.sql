-- Synthetic production-era records only. No values originate from the private dump.
INSERT INTO "User" (id,email,"passwordHash",salt,name,"isAdmin") VALUES
 ('owner','owner@example.test','synthetic-hash','synthetic-salt','Owner',true),
 ('friend','friend@example.test','synthetic-hash-2','synthetic-salt-2','Friend',false);
INSERT INTO "UserSettings" (id,"userId","firstDayOfWeek","defaultSharePermission",timezone,"defaultTab") VALUES
 ('settings-owner','owner','sunday','busy','Europe/Berlin','calendar'),
 ('settings-friend','friend','monday','titles','America/New_York','friends');
INSERT INTO "AppSettings" (id,"registrationsOpen","inviteOnly","updatedAt") VALUES ('global',false,true,'2026-03-06');
INSERT INTO "InviteCode" (id,code,"createdBy","usedBy","usedAt") VALUES ('used','synthetic-used','owner','friend','2026-03-06'),('unused','synthetic-unused','owner',NULL,NULL);
INSERT INTO "Calendar" (id,"userId",name,type,url,config,"lastSync","updatedAt","syncInterval")
SELECT 'calendar-'||provider,'owner',provider,provider::"CalendarType",'https://calendar.example.test/'||provider,
 jsonb_build_object('password','synthetic-password','username','synthetic-user','calendarId','remote-'||provider,'refreshToken','synthetic-refresh'), '2026-03-07','2026-03-06',0
FROM unnest(ARRAY['ics','caldav','google','icloud','outlook','fastmail']) provider;
INSERT INTO "Event" (id,"calendarId","externalId",title,description,location,"startTime","endTime","allDay","updatedAt") VALUES
 ('event','calendar-ics','external-event','Synthetic event','Retain description','Retain location','2026-11-09 09:00','2026-11-09 10:00',false,'2026-03-06');
INSERT INTO "CalendarShare" (id,"calendarId","sharedWithId",permission) VALUES
 ('share-busy','calendar-ics','friend','busy'),('share-titles','calendar-caldav','friend','titles'),('share-full','calendar-google','friend','full');
INSERT INTO "Friendship" (id,"user1Id","user2Id",status,"updatedAt","sharedCalendars") VALUES ('friends','owner','friend','accepted','2026-03-06',true);
