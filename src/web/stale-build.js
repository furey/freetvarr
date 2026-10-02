export const isStaleBuild = ({ loaded, latest, dismissed = null }) =>
  Boolean(loaded && latest) && latest !== loaded && latest !== dismissed

export const shouldReloadOnPull = ({ loaded, latest }) => isStaleBuild({ loaded, latest })
