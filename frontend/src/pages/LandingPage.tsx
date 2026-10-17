const COVER = `${import.meta.env.BASE_URL}strata-cover.png`;

export function LandingPage() {
  return (
    <section className="cover-page">
      <img className="cover-photo" src={COVER} alt="Cover art of a quadcopter over a coastal hangar at dusk. The flying view is the live simulator, not this picture." />
      <div className="cover-scrim" />
      <header className="cover-nav">
        <a className="cover-brand" href="#home">
          <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 4 L28 26 H21.5 L16 15.5 L10.5 26 H4 Z" />
          </svg>
          STRATA
        </a>
        <nav aria-label="STRATA">
          <a href="#fly">Flight</a>
          <a href="#learn">Academy</a>
          <a href="#aircraft">Aircraft</a>
          <a href="#ground">Ground control</a>
          <a href="#lab">Lab</a>
        </nav>
        <p>Learn to fly. Understand why.</p>
      </header>
      <div className="cover-copy">
        <p className="eyebrow">STRATA</p>
        <h1>Learn to fly. Understand why.</h1>
        <p>Flight simulation and engineering training. The photograph is the cover. The aircraft you fly is the live model.</p>
        <div className="cover-actions">
          <a
            className="primary"
            href="#fly"
            onClick={() => sessionStorage.setItem("fly.enter", "1")}
          >
            Initialize flight
          </a>
          <a href="#aircraft">Explore aircraft</a>
          <a href="#learn">Flight academy</a>
        </div>
      </div>
    </section>
  );
}
