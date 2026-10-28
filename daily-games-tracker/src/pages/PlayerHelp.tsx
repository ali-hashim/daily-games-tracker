export default function PlayerHelp() {
  return (
    <section className="player-help management-panel" aria-labelledby="player-help-heading">
      <h2 id="player-help-heading">Player setup and help</h2>

      <details>
        <summary>Set up Upload to WHT</summary>
        <ol className="setup-steps">
          <li>Use an Apple iPhone with the Shortcuts app, and open your invitation in Safari.</li>
          <li>Register this device. Keep the result page open until the setup is complete.</li>
          <li>
            Copy the one-time private code. If copying fails, select the code on the page and copy
            it manually.
          </li>
          <li>
            Install the clean supported Upload to WHT template, then enter the code in its Import
            Question.
          </li>
          <li>Return to WHT in Safari. The code cannot be recovered if the setup page is lost.</li>
        </ol>
        <p>
          If no install link is shown, the supported link is unavailable. Ask the administrator
          before continuing.
        </p>
      </details>

      <details>
        <summary>Share a completed game</summary>
        <ul>
          <li>For Krillion, use Safari's Share button on the completed results page.</li>
          <li>For MapTap, use its in-game “Share your score” action.</li>
          <li>
            Choose Upload to WHT, review the native confirmation, and submit. Choose Cancel to leave
            the result unsubmitted.
          </li>
          <li>
            After completion, the Shortcut can copy score-only leaderboard text and open the
            matching WHT Daily page.
          </li>
          <li>
            A saved result for the same player, game, and day cannot be overwritten. A repeat is
            reported as already saved.
          </li>
        </ul>
      </details>

      <details>
        <summary>Sign in and view Daily details</summary>
        <ul>
          <li>
            Open User, choose Login with Device, then approve the request in your registered Upload
            to WHT Shortcut.
          </li>
          <li>
            Safari is the intended browser. A home-screen web app uses a separate browser session.
          </li>
          <li>
            Log out to end the current browser's WHT session. Ask the administrator to revoke a
            device credential.
          </li>
          <li>
            Daily detail tables require authentication and each game's details unlock separately
            after you submit that game's result for the selected day.
          </li>
        </ul>
      </details>

      <details>
        <summary>Scores, privacy, and support</summary>
        <p>
          WHT stores the game, date, total, and each round's prompt, answer, and score. Public pages
          show display names and score summaries. Daily details are authenticated and locked
          independently by game until you submit that game's result for the selected day.
        </p>
        <p>
          For a correction or deletion request, or other support, contact the administrator. The
          administrator can review your request and explain what can be changed.
        </p>
      </details>

      <details>
        <summary>Fix a setup or upload problem</summary>
        <ul>
          <li>
            An expired, reused, or previously redeemed invitation cannot be used again. Ask the
            administrator for a new one.
          </li>
          <li>
            If you lost the setup page or code, ask for another invitation. Redownloading the
            Shortcut does not recover a private code.
          </li>
          <li>
            If you skipped setup or need a second or replacement device, ask for an invitation for
            your existing player identity; do not create a duplicate identity.
          </li>
          <li>
            For a lost or leaked device, ask the administrator to revoke that device credential. A
            revoked credential needs a new invitation.
          </li>
          <li>
            If WHT rejects a Share input, use Safari's completed-page Share for Krillion or MapTap's
            in-game Share your score action.
          </li>
          <li>
            If a request is interrupted or you go offline, reconnect and retry once. WHT will report
            an already-saved result if the first request completed; it cannot overwrite that result.
          </li>
          <li>
            If the Shortcut says an update is required, install the supported latest template from
            its provided link. If the link is unavailable, contact the administrator.
          </li>
        </ul>
      </details>
    </section>
  );
}
