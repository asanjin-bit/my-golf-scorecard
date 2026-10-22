# Golf Scorecard Multiplayer PWA — deployment guide

## What's included
- Your original three-course golf tracker, course pars, personal rounds, and CSV export.
- Create and join a group with a random 12-character invitation code; 2–4 players per group.
- Real-time gross leaderboard with holes completed, score relative to par, and total strokes.
- Firebase anonymous authentication and Firestore offline cache, with locally stored scores.

## Activate multiplayer (required)
1. Go to https://console.firebase.google.com and create a Firebase project (Spark free tier is typically sufficient for a small group).
2. Under **Project settings → Your apps**, register a **Web app** and copy its `firebaseConfig` values into `firebase-config.js`. Keep the property names unchanged. Firebase's **web API key is not a secret**, but do not publish service account/private keys.
3. Under **Authentication → Sign-in method**, enable **Anonymous** authentication.
4. Under **Firestore Database**, create a Firestore database (choose an appropriate region). Open **Rules** and replace the initial rules with the contents of `firestore.rules`, then **Publish**. Never use permissive test rules in production.
5. Under **Authentication → Settings → Authorized domains**, confirm your GitHub Pages hostname (`YOUR-USERNAME.github.io`) is allowed where required. Add it if necessary.
6. Upload the contents of this folder to the **root** of your EXISTING GitHub Pages repo. Upload files, **not the ZIP**. Do not upload `firestore.rules` as application JS; it may live in the repo as documentation.
7. Refresh your site while online, close/reopen the installed PWA, and verify it says **Ready** rather than **Setup needed**.

## First test
- On phone 1: choose a course, enter your name, select **Create round**. Share the invitation URL/code.
- On phone 2: open that website/link, enter another name, select **Join round**.
- Enter a hole score on phone 1 and check the leaderboard on phone 2; repeat in reverse.
- Put phone 1 offline, enter another score, reconnect and confirm it appears on phone 2.
- Test with four phones, closing/reopening the app, and all three courses.

## Important limitations of this first version
- **Only a development MVP**: Firebase configuration and live cross-device testing must be done in your own Firebase project. It does not include a preconfigured live backend.
- Anonymous accounts belong to the browser/app installation. Clearing device/browser data or reinstalling can lose that identity and access to existing score entries. Cross-device account recovery is **not included**.
- The same user should not edit scores from multiple devices at once. Firestore offline updates use last-write-wins on the same scorecard document. Persistent Firestore cache may be unavailable under some iOS/private-browser conditions.
- New group rounds start with a blank scorecard for the selected course; your previously **saved** local round histories are left alone, but an unfinished local scorecard for that same course is reset. Save it first if needed.
- Round membership persists after **Exit group view**; this is not a deletion or privacy-removal action.
- The join code is an invitation capability; anyone with the link can request to join until four slots are filled. Do not share it publicly.
- The leaderboard ranks *score relative to par on completed holes* even when players have completed different numbers of holes, so it is a provisional comparison. No handicap calculations or official competition scoring.
- The original **Save round** button still records a local copy. Group scores are synchronized automatically, even without pressing it.
- The app shell is cached for offline use, but the Firebase CDN SDK should be loaded at least once while online on each phone. Offline functionality also requires previously established authorization/cache.

## Updating an existing app
Upload new app files into the same repository. On the next connected launch, the service worker refreshes the application assets; hard refresh or close and reopen if you still see the previous version. Before replacing code, export local round history CSV. Keep the same GitHub Pages URL to preserve same-origin browser storage.

## Troubleshooting
- **Setup needed**: `firebase-config.js` still has placeholders or your cached config has not refreshed.
- **Authentication error**: enable Anonymous provider and check authorized domain.
- **Missing or insufficient permissions**: publish `firestore.rules` correctly; check rules in Firebase Console.
- **Invitations not found**: verify invite code, Firebase project, online connection, and which repo/URL was opened.
- **No offline recovery**: iOS/browser settings may deny persistent IndexedDB cache, and anonymous sign-in may require a previous online session.
