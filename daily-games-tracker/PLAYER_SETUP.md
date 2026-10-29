# Player setup and help

WHT uses invitation-only device registration. Ask the administrator for an Add Device invitation; do not create a second player identity to replace a device.

## Set up your device

You need an Apple iPhone with the Shortcuts app and Safari. Open your invitation in Safari on that iPhone. Invitations can be used once and expire after 24 hours.

1. Review the player name and register this device. The registration result signs in this Safari browser.
2. Follow the six visible cards on the result page: copy the one-time private code; download **Upload to WHT**; open Safari Downloads beside the address bar; add the Shortcut and enter the code in its **Import Question**; use Safari Share → **Edit Actions** → **Favorites**; then open **Play**.
3. If the copy button fails, select the code on the page and copy it manually. Keep the result page open until setup is complete.
4. Do not share the configured Shortcut: someone who can inspect it can read its private device code.

The signed-in User page's redownload control is hidden pending future device codes. Its authenticated backend route remains available. A replacement device needs a new invitation; downloading the template does not recover a private code.

The private code is shown once and cannot be recovered by WHT. Redownloading the Shortcut does not restore the code. If the registration page closes before setup is complete, ask the administrator for a new invitation.

## Share a completed result

- **Krillion:** open the completed results page in Safari and use Safari's Share button.
- **MapTap:** use MapTap's in-game **Share your score** action.
- Choose **Upload to WHT** and review the native confirmation before submitting. Choose **Cancel** to stop without submitting.
- When the upload completes, the Shortcut can copy the score-only leaderboard text and open the matching WHT Daily page.

A result is unique per player, game, and day. A saved result cannot be overwritten; a repeat is reported as already saved.

## Shared setup and troubleshooting help

On the Play page, **Set up Upload to WHT** explains the Favorites steps above and directs players who need an invitation or cannot find the expected action to the administrator. **Share a completed game** shows the Krillion Safari Share and MapTap in-game **Share your score** paths, then explains submission and clipboard feedback. **Fix “Could not run JavaScript”** walks through searching iPhone Settings for Shortcuts, opening **Advanced**, enabling **Allow Running Scripts**, and retrying the full “Could not run Run JavaScript on Web Page” error.

## Sign in and view Daily details

Open **User → Login with Device**, then approve the request in your registered Upload to WHT Shortcut. Safari is the intended browser. A home-screen web app uses a separate browser session.

Log out to end the current browser's WHT session. Device credential revocation is an administrator action. Daily detail tables require authentication, and each game's details stay locked independently until you submit that game's result for the selected day.

## Data, privacy, and support

WHT stores the game, date, total, and each round's prompt, answer, and score. Public pages show player display names and score summaries. Daily details are authenticated and locked independently by game until the player submits that game's result for the selected day.

For a correction, deletion request, or support, contact the administrator. The administrator can review the request and explain what can be changed. This guide does not promise automatic deletion or a retention period.

## Troubleshooting

- **Invitation expired, reused, or already redeemed:** it cannot be used again. Ask the administrator for a new Add Device invitation.
- **Setup page or private code lost:** WHT cannot recover the code. Ask for another invitation; redownloading the Shortcut does not recover it.
- **Setup was skipped:** ask the administrator for another invitation. Do not create a duplicate player identity.
- **Second or replacement device:** use the existing player identity and ask the administrator to issue an Add Device invitation for that device.
- **Device lost or code may have leaked:** ask the administrator to revoke that device credential. A revoked credential cannot be restored; request a new invitation for a replacement device.
- **Wrong Share input:** use Safari's completed-results Share for Krillion and MapTap's in-game **Share your score** action.
- **Offline or interrupted request:** reconnect and retry once. If the first request completed, WHT reports that the result is already saved. Contact the administrator if the outcome remains unclear.
- **Result already saved:** the existing daily result cannot be replaced. Contact the administrator if it needs review.
- **Update required:** install the supported latest template from the provided link, then share again. If that link is unavailable, contact the administrator; do not use an unverified template.

## Administrator invitation checklist

Before inviting anyone:

- Confirm the clean **Upload to WHT** template for the intended release has been reviewed and verified, and its current manifest and artifact are available in the configured R2 bucket. The download route checks the manifest, artifact size, and SHA-256 digest before serving the file.
- Confirm the registration download and backend User/update-required entry points use the relative `/api/shortcut/download` path only when the bucket is configured. The visible User-page redownload control is currently hidden. Downloads require a signed-in player session; do not direct players to a raw bucket object or a configured Shortcut containing a private device code.
- Find the player's existing identity or create it once. Check for an existing identity before creating one.
- Issue a one-use, 24-hour **Add Device** invitation for that identity only after the verified template is available through the authenticated download route.
- Send the invitation privately using an approved channel. Do not put real invitation links, device codes, player details, or account details in public documentation, reports, or logs.
- Tell the player to keep the registration result open until the code is entered in the clean template's Import Question. The player should not send the private code back to you.
- If the invite expires or is used, issue a fresh invitation for the same player identity. For a known lost or leaked device credential, revoke it before replacement setup.

## Private welcome-message template

Replace each bracketed placeholder privately. Do not paste a real invitation or device code into this document.

> Hi [PLAYER DISPLAY NAME],
>
> Your WHT Add Device invitation is here: [PRIVATE INVITATION LINK]
>
> Open it in Safari on your Apple iPhone, register the device, and keep the result page open. Copy the one-time private code, install the clean supported Upload to WHT template shown there, and enter the code in the Shortcut's Import Question. Return to WHT in Safari when setup is complete.
>
> The invitation expires after 24 hours and works once. Do not share the configured Shortcut or its private code. If you lose the setup page or need another device, contact [ADMIN SUPPORT CONTACT].
