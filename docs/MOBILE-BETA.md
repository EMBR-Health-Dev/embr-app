# Mobile beta: TestFlight and Google Play internal testing

How to get the EMBR app onto testers' phones. Every step needs your own
Apple, Google and Expo accounts, so these are run by you, not by CI.

The `beta` build profile in `apps/mobile/eas.json` makes store builds
that talk to the production API (`https://embrapi-production.up.railway.app`,
the API's only domain on Railway). The `preview` profile points at the
same API for ad hoc installs.

## What testers do

1. Create an account on the web at `https://app.embrhealthcare.com/register`.
   The app does not create accounts yet; its sign up screen sends people
   to the web.
2. Install the app from the TestFlight or Play invite.
3. Log in with the same email and password.

## One time setup

| Account                 | Cost                | Notes                                                                                 |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Expo                    | Free tier is enough | Builds run on Expo's servers                                                          |
| Apple Developer Program | USD 99 a year       | Enrol as an organisation now that the company exists; Apple asks for a D-U-N-S number |
| Google Play Console     | USD 25 once         | Register as an organisation for the same reason                                       |

1. **Link the Expo project.** From `apps/mobile`:

   ```sh
   npx eas-cli login
   npx eas-cli init
   ```

   This writes `extra.eas.projectId` into `app.json`. Commit that change.

2. **Apple.** In App Store Connect, create an app with bundle ID
   `health.embr.mobile`. The first `eas build` for iOS signs you in to
   Apple and creates the certificates and profiles for you.

3. **Google.** In Play Console, create an app with package
   `health.embr.mobile`. Google only accepts automated uploads after a
   first manual one: build once (below), download the `.aab` from the
   Expo build page, and upload it by hand to **Testing > Internal
   testing**. Then create a Google service account key for uploads
   (Expo's guide: "Creating a Google Service Account") and give its JSON
   file to `eas submit` when it asks.

## Each new beta build

From `apps/mobile`:

```sh
npx eas-cli build --profile beta --platform all
npx eas-cli submit --profile beta --platform ios --latest
npx eas-cli submit --profile beta --platform android --latest
```

Or build and submit in one go with
`npx eas-cli build --profile beta --platform all --auto-submit`.

Build numbers increase on their own (`autoIncrement`). Android builds
go to the internal testing track. iOS builds appear in TestFlight once
Apple has processed them, usually within an hour.

## Adding testers

**iPhone (TestFlight)**

- _Internal testers_: people added as users of your App Store Connect
  team, up to 100. No review; they get each build as soon as it is
  processed.
- _External testers_: anyone with an email address or a public link, up
  to 10,000. The first build for an external group goes through Apple's
  beta review, which usually takes a day or so. Use this for beta
  testers outside the company: create a group, turn on the public link,
  and share it.

**Android (Play internal testing)**

- Up to 100 testers. Add their Google account emails to a tester list
  under **Internal testing**, then send them the opt in link shown
  there. New builds reach them through the Play Store.

## Questions the stores will ask

These are your decisions; nothing in the repository answers them for
you.

- **Encryption (Apple, every build).** App Store Connect asks whether
  the app uses encryption beyond the standard exemptions. Once you have
  answered, you can record the answer in `app.json` under
  `ios.config.usesNonExemptEncryption` so it stops asking.
- **External TestFlight testing** asks for a beta description, a
  feedback email and a privacy policy link.
- **Play Console** asks for its App content declarations before a
  release can go out, including a privacy policy link, the data safety
  form and the health apps declaration.

## Daily reminders

The reminders are local notifications scheduled on the phone, so no
push notification setup is needed for the beta.
