/**
 * The pet surface's copy, one dictionary per locale.
 * @module @deepseek-ai/dsh-client-ui-pet/client
 */

const zh = {
  'commandInput.aria': '命令输入',
  'settings.nav': '宠物',
  'settings.title': '智能伙伴',
  'settings.intro': '宠物会管理对话串，并突出显示需要关注的事项。',
  'settings.catalog': '选择宠物',
  'settings.refresh': '刷新列表',
  'settings.wake': '唤醒',
  'settings.sleep': '休眠',
  'settings.selected': '已选',
  'settings.select': '选择',
  'settings.update': '更新',
  'settings.customPets': '自定义宠物',
  'settings.importPackage': '导入宠物包',
  'settings.openFolder': '打开文件夹',
  'settings.appearance': '外观',
  'settings.size': '宠物大小',
  'settings.imported': '已导入 {name}。',
  'settings.updated': '已更新 {name}。',
  'settings.cancelled': '操作已取消。',
  'settings.hostUnavailable': '当前宿主不支持本地宠物包操作。',
  'settings.actionFailed': '操作失败',
  'settings.empty': '当前没有可用的宠物包。',
} as const

/** Locale keys of the pet surface. */
export type PetKey = keyof typeof zh

/** English fallback dictionary. */
export const en: Record<PetKey, string> = {
  'commandInput.aria': 'Command input',
  'settings.nav': 'Pet',
  'settings.title': 'Smart companion',
  'settings.intro': 'Your companion follows conversation threads and highlights items that need attention.',
  'settings.catalog': 'Choose companion',
  'settings.refresh': 'Refresh list',
  'settings.wake': 'Wake',
  'settings.sleep': 'Sleep',
  'settings.selected': 'Selected',
  'settings.select': 'Select',
  'settings.update': 'Update',
  'settings.customPets': 'Custom pets',
  'settings.importPackage': 'Import package',
  'settings.openFolder': 'Open folder',
  'settings.appearance': 'Appearance',
  'settings.size': 'Pet size',
  'settings.imported': '{name} was imported.',
  'settings.updated': '{name} was updated.',
  'settings.cancelled': 'Operation cancelled.',
  'settings.hostUnavailable': 'This host does not support local pet package operations.',
  'settings.actionFailed': 'The operation failed',
  'settings.empty': 'No pet packages are available.',
}

export { zh }
