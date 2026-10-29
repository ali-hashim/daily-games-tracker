export default function PlayerHelp() {
  return (
    <section className="player-help management-panel" aria-labelledby="player-help-heading">
      <h2 id="player-help-heading">Player setup and help</h2>

      <details className="player-help-topic">
        <summary>Set up Upload to WHT</summary>
        <div className="player-help-topic__content">
          <p>Use an Apple iPhone with the Shortcuts app, and open your invitation in Safari.</p>
          <ol className="setup-steps">
            <li>Register this device using your invitation.</li>
            <li>Keep the result page open until setup is complete.</li>
            <li>Copy the one-time private code shown on the result page.</li>
            <li>
              Install the clean supported Upload to WHT template and enter the code in its Import
              Question.
            </li>
            <li>Return to WHT in Safari after adding the Shortcut.</li>
          </ol>
          <p>If you have not received an invitation, contact the administrator.</p>
        </div>
      </details>

      <details className="player-help-topic">
        <summary>Share a completed game</summary>
        <div className="player-help-topic__content">
          <p>
            For Krillion, finish the game, then tap Safari's Share button on the completed results
            page.
          </p>
          <img
            className="player-help-image"
            src="/images/player-help/krillion-share.jpg"
            alt="Safari Share button on a completed Krillion result page"
          />
          <p>For MapTap, use the in-game “Share your score” action.</p>
          <img
            className="player-help-image"
            src="/images/player-help/maptap-share.jpg"
            alt="MapTap Share your score button highlighted below the finished game"
          />
          <p>Choose Upload to WHT and submit your score.</p>
          <p>After submission, your daily leaderboard text is copied for you.</p>
          <p>
            If Upload to WHT is missing, open the Share sheet&apos;s Edit Actions and add it to
            Favorites.
          </p>
          <figure className="player-help-figure">
            <img
              className="player-help-image"
              src="/images/player-help/safari-share-button.jpg"
              alt="Safari bottom toolbar with the Share button highlighted"
            />
            <figcaption className="player-help-image-caption">Tap Share in Safari.</figcaption>
          </figure>
          <figure className="player-help-figure">
            <img
              className="player-help-image"
              src="/images/player-help/edit-actions-button.jpg"
              alt="Edit Actions button in Safari's share sheet"
            />
            <figcaption className="player-help-image-caption">
              Tap Edit Actions, then add Upload to WHT to Favorites.
            </figcaption>
          </figure>
        </div>
      </details>

      <details className="player-help-topic">
        <summary>Fix a scripting security-settings error</summary>
        <div className="player-help-topic__content">
          <p>
            In a completed Krillion game in Safari, the “Run JavaScript on Web Page” action reads
            the shared Krillion result for Upload to WHT.
          </p>
          <p>
            Follow these steps only if Upload to WHT shows “Could not run “Run JavaScript on Web
            Page”” and says: This shortcut cannot be run because this action is a scripting action
            and your Shortcuts security settings don’t allow you to run scripting actions.
          </p>
          <figure className="player-help-figure">
            <img
              className="player-help-image"
              src="/images/player-help/scripting-security-error.jpg"
              alt="Krillion in Safari showing the Run JavaScript on Web Page security error"
            />
            <figcaption className="player-help-image-caption">
              The scripting-security-settings error appears while sharing a completed Krillion
              result.
            </figcaption>
          </figure>
          <ol className="setup-steps">
            <li>
              On your iPhone, open Settings, search for “Shortcuts,” and tap the Shortcuts result.
              <figure className="player-help-figure">
                <img
                  className="player-help-image"
                  src="/images/player-help/shortcuts-settings-search.jpg"
                  alt="iPhone Settings search results with Shortcuts selected"
                />
                <figcaption className="player-help-image-caption">
                  Search Settings for Shortcuts and tap its result.
                </figcaption>
              </figure>
            </li>
            <li>Open Shortcuts settings, then Advanced.</li>
            <li>
              Turn on “Allow Running Scripts.”
              <figure className="player-help-figure">
                <img
                  className="player-help-image"
                  src="/images/player-help/allow-running-scripts.jpg"
                  alt="Shortcuts Advanced settings with Allow Running Scripts turned on"
                />
                <figcaption className="player-help-image-caption">
                  Turn on Allow Running Scripts.
                </figcaption>
              </figure>
            </li>
            <li>
              Return to the completed Krillion game in Safari and retry Share → Upload to WHT.
            </li>
          </ol>
        </div>
      </details>
    </section>
  );
}
