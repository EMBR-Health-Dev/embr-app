# Weekly email

A short reminder once a week to look back at the week in EMBR.

- **Opt in only.** Off for everyone until she turns on "Weekly email" in
  Settings (web or mobile). Turning it off is always possible, even with
  consent pending.
- **Nothing from her record.** No counts, symptoms, dates or names: the
  email is fixed copy in English and Japanese with links to the timeline
  and to Settings (`sendWeeklyReminderEmail` in
  `apps/api/src/modules/auth/mailer.ts`). An inbox is not a private place.
- **Only verified addresses** receive it.
- **When:** Sunday from 09:00 UTC (18:00 in Japan). The API checks every
  15 minutes (`apps/api/src/modules/notifications/weekly-email.ts`), so
  nothing extra needs deploying or scheduling.
- **Never twice in a week.** Each send is claimed first with one
  conditional write on `users.weeklyEmailLastSentAt`; anyone sent one in
  the last six days is skipped. Two API instances, or a restart during
  the window, cannot double send. A failed send is logged and not
  retried that week.
- **Logs** carry counts only (`weekly email run: due, sent`), never an
  address.
- Sent through Resend like every other email (`RESEND_API_KEY`,
  `EMAIL_FROM`); without a key it logs and sends nothing.
