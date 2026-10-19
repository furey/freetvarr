export const ScheduledView = {
  template: `
    <div class="ui-page scheduled-page">
      <page-header title="Recordings" subtitle="Everything you have, and everything on its way." />
      <recordings-tabs current="scheduled" />
      <section class="ui-empty" aria-label="Scheduled">
        <h2 class="ui-empty-title">Nothing scheduled</h2>
        <p class="ui-empty-text">Record an episode or a whole series from the Guide and it appears here.</p>
        <a href="#/guide" class="ui-button ui-button-primary">Open the Guide</a>
      </section>
    </div>
  `,
}
