export const HomeView = {
  template: `
    <div class="ui-page home-page">
      <page-header title="Home" brand />
      <section class="ui-empty" aria-label="Nothing recorded yet">
        <h2 class="ui-empty-title">Nothing recorded yet</h2>
        <p class="ui-empty-text">Find a show in the Guide and record it. New recordings and what is on now show up here.</p>
        <a href="#/guide" class="ui-button ui-button-primary">Open the Guide</a>
      </section>
    </div>
  `,
}
