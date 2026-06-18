<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hackathon Content Library</title>
  <link rel="stylesheet" href="css/styles.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a href="#/home" class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-text">Hackathon Content Library<small>SLED AI Hackathons</small></span>
      </a>
      <nav class="mainnav" id="mainnav">
        <a href="#/home" data-route="home">Home</a>
        <a href="#/events" data-route="events">Hackathons</a>
        <a href="#/agencies" data-route="agencies">Agencies</a>
        <a href="#/usecases" data-route="usecases">Use Cases</a>
        <a href="#/calendar" data-route="calendar">Calendar</a>
        <a href="#/pipeline" data-route="pipeline">Pipeline</a>
        <a href="#/patterns" data-route="patterns">Patterns</a>
        <a href="#/lessons" data-route="lessons">Lessons</a>
        <a href="#/audit" data-route="audit">Audit</a>
        <a href="#/about" data-route="about">About</a>
        <div class="nav-dropdown" id="registerMenu">
          <button class="nav-cta nav-dd-toggle" id="registerToggle" aria-haspopup="true" aria-expanded="false">+ Register &#9662;</button>
          <div class="nav-dd-panel" role="menu">
            <a href="#/register" role="menuitem" class="nav-dd-head">Register &amp; Capture hub</a>
            <a href="#/register/agency" role="menuitem">Register an Agency</a>
            <a href="#/register/event" role="menuitem">Manage an Event</a>
            <a href="#/register/pattern" role="menuitem">Reusable Pattern / Accelerator</a>
            <a href="#/register/feedback" role="menuitem">Capture Feedback</a>
          </div>
        </div>
      </nav>
    </div>
  </header>

  <main id="app" class="app">
    <div class="loading">Loading library&hellip;</div>
  </main>

  <footer class="footer">
    <span>Hackathon Content Library &mdash; SLED AI Hackathons program. Built by Anwar Shaikh. Draft v2 &middot; <a href="#/about" style="color:inherit;text-decoration:underline">About</a></span>
  </footer>

  <script type="module" src="js/app.js"></script>
</body>
</html>
