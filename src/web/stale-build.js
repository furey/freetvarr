export const isStaleBuild = ({ loaded, latest }) =>
  Boolean(loaded && latest) && latest !== loaded

export const shouldReloadOnPull = ({ loaded, latest }) => isStaleBuild({ loaded, latest })
