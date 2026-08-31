# Firebase configuration, lionsfundraising.com

`firestore.rules` is the only enforcement standing between a signed-in
volunteer and the whole roster. The client-side `LIONS_AUTH.canAccess()` calls
on `/payouts`, `/treasurer` and `/dashboard` are user-interface convenience,
not security: anyone with a login and a browser console can query Firestore
directly, and only these rules decide what comes back.

It lived in `_deploy/firebase/` until 2026-08-30. That folder is scratch, is
outside both repositories, and is on the list to be deleted. The single most
security-critical file in the project was sitting in it, unversioned.

This directory is at the repository root, deliberately outside `public_html`,
so it is version-controlled and can never be served over HTTP. The deploy
workflow excludes `firebase/**` for the same reason and asserts the file is
present and non-empty before it will publish.

## What the rules currently say about the roster

    match /Lions-Fundraising-Users/{docId} {
      allow read, write, delete: if isSystemAdmin();
      allow read: if isTreasurer() || isEventSupervisor();
      allow read: if isAuthenticated() && stored().email == authEmail();
      ...
    }

An ordinary signed-in volunteer can read only documents whose `email` field
matches their own sign-in address. The roster is not enumerable by them. This
is why the "roster type-ahead exposure" concern was closed on 2026-08-30
without a user-interface change: there was nothing exposed.

## This copy has not been proven to match production

Nothing here reads the deployed rules. If someone edited them in the Firebase
console, this file is stale and no check will say so. Confirm in the console
that the deployed rules match, then keep every future change in this file and
deploy from it:

    firebase deploy --only firestore:rules

Editing rules in the console instead is how this file becomes fiction.

## Deploying the rules

From this directory:

    npm install -g firebase-tools     # once, needs Node
    firebase login                    # once, opens a browser
    firebase deploy --only firestore:rules

`.firebaserc` pins the target to **lionsfundraising-1f854**, which is the
project `js/lions-auth.js` and `universal-auth.js` initialise, and therefore
the project behind `/payouts`, `/treasurer`, `/dashboard`, `/signup` and
`/earnings`.

## UNRESOLVED: a second Firebase project

`claims/index.html` does not use the shared auth module. It carries its own
hardcoded `firebaseConfig` pointing at a different project entirely:

    projectId:     "lions-fundraising"
    authDomain:    "lions-fundraising.firebaseapp.com"
    databaseURL:   "https://lions-fundraising-default-rtdb.firebaseio.com"
    storageBucket: "lions-fundraising.appspot.com"
    appId:         "1:246375369187:web:f9878df70f8a17e4"

Different project, different database, different security rules. Nothing in
this directory governs it. Reimbursement claims submitted through that page do
not land in the same Firestore as everything else, and whatever rules protect
them have never been reviewed here.

Two questions have to be answered before this is safe:

1. Is `lions-fundraising` a live project, or an abandoned first attempt that
   `/claims` was never repointed away from?
2. If it is live, what do its rules say? If it is dead, `/claims` is writing
   into nothing and every claim submitted there is lost.

Until that is settled, do not assume `firestore.rules` covers the whole
application. It covers one of two projects.
