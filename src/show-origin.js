export const AUTO_ORIGIN = 'auto'
export const USER_ORIGIN = 'user'

export const isAutoTitleMatch = (show) => show?.origin === AUTO_ORIGIN

export const isUserFolderRow = (row) => row.show_id != null && row.show_origin !== AUTO_ORIGIN
