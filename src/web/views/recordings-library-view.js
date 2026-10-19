export const RecordingsLibraryView = {
  template: `
    <div class="ui-page recordings-page">
      <page-header title="Recordings" subtitle="Everything you have, and everything on its way." />
      <recordings-tabs current="library" />
      <section class="ui-empty" aria-label="Library">
        <h2 class="ui-empty-title">Nothing recorded yet</h2>
        <p class="ui-empty-text">Shows, movies, and one-offs you record appear here.</p>
        <a href="#/guide" class="ui-button ui-button-primary">Find a show in the Guide</a>
      </section>
    </div>
  `,
}
