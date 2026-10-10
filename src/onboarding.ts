/** 首次访问引导：独立 key，不参与业务状态，也不随“重置演示数据”清除 */
export const ONBOARDING_KEY = 'biye-dazi-ju:onboarding-seen'

export function hasSeenOnboarding() {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return true // 存储不可用时不打扰用户
  }
}

export function markOnboardingSeen() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, '1')
  } catch {
    /* ignore */
  }
}
